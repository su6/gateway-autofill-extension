const COMMON_DEFAULTS = {
  jsfDomain: 'crm.jdl.com', httpDomain: 'crm-http.jdl.com',
  sensitiveTag: 'ToB', apiType: '查询', flowType: 'ToB(商家)', profile: 'crm-jsf'
};
const ENVIRONMENT_DEFAULTS = {
  uat: { ...COMMON_DEFAULTS, businessGroup: 'jdl_crm - jdl_crm' },
  production: { ...COMMON_DEFAULTS, businessGroup: 'jdl_crm - 新CRM' }
};
const template = document.querySelector('#template');
const button = document.querySelector('#fill');
const status = document.querySelector('#status');
const profile = document.querySelector('#profile');
const profileHint = document.querySelector('#profileHint');
const pinRule = document.querySelector('#pinRule');
const pinRuleRow = pinRule.closest('.rule');
const preview = document.querySelector('#preview');
const environment = document.querySelector('#environment');
const TEMPLATE_TEXTS = {
  jsf: `CRM.JSF\n接口签名: com.jdl.crm.customer.api.service.factoring.CrmFactoringApplyApi#getEnums\n应用名称: crm-customer\nJSF别名: crm-uat\nJSF校验token: 1234\nAPI名称: 保理申请页面枚举查询\nURL: /factoring/getEnums\nTPS峰值: 100\n资产负责人: bianlei5`,
  http: `CRM.HTTP\n应用名称: crm-customer\nAPI名称: 保理申请页面枚举查询\nURL: /factoring/getEnums\nTPS峰值: 100\n资产负责人: bianlei5\n集群: crm-customer`
};
const configInputs = ['businessGroup', 'jsfDomain', 'httpDomain', 'sensitiveTag']
  .reduce((all, id) => ({ ...all, [id]: document.querySelector(`#${id}`) }), {});
let config = { ...ENVIRONMENT_DEFAULTS.uat };
let environmentKey = 'uat';

function serviceType() { return profile.value === 'crm-http' ? 'HTTP服务' : 'JSF服务'; }
function show(message, error = false) { status.textContent = message; status.className = error ? 'error' : ''; }
function showToast(message) {
  const toast = document.querySelector('#toast');
  toast.textContent = message;
  toast.classList.add('visible');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove('visible'), 2000);
}
function normalise(value) { return String(value || '').replace(/[\s：:]/g, '').toLowerCase(); }

function parseTemplate(text) {
  const keys = { '接口签名': 'signature', 'jsf接口签名': 'signature', '应用': 'app', '应用名': 'app', '应用名称': 'app', '别名': 'alias', 'jsf别名': 'alias', 'jsf校验token': 'jsfToken', 'api名称': 'apiName', 'url': 'url', 'tps峰值': 'tps', '资产负责人': 'assetOwner', '敏感标签': 'sensitiveTag', '集群': 'cluster', '集群名称': 'cluster', '选择集群': 'cluster' };
  const data = {};
  text.split(/\r?\n/).forEach(line => {
    const match = line.match(/^\s*([^：:]+?)\s*[：:]\s*(.*?)\s*$/);
    if (match && keys[normalise(match[1])] && match[2]) data[keys[normalise(match[1])]] = match[2].trim();
  });
  if (!data.cluster) {
    const match = text.match(/选中\s*([a-zA-Z0-9_.-]+)\s*集群/i);
    if (match) data.cluster = match[1];
  }
  const required = serviceType() === 'HTTP服务' ? ['app', 'apiName', 'url', 'cluster'] : ['signature', 'app', 'alias', 'apiName', 'url'];
  const missing = required.filter(key => !data[key]);
  const errors = missing.length ? [`缺少：${missing.map(key => ({ signature: '接口签名', app: '应用', alias: '别名', apiName: 'API名称', url: 'URL' })[key]).join('、')}`] : [];
  if (serviceType() !== 'HTTP服务' && data.signature && !/^.+#.+$/.test(data.signature)) errors.push('接口签名应为“包名.接口名#方法名”。');
  if (data.tps && !/^\d+(\.\d+)?$/.test(data.tps)) errors.push('TPS峰值应为数字。');
  return { data, errors };
}

function renderProfile() {
  const isHttp = serviceType() === 'HTTP服务';
  profileHint.textContent = isHttp
    ? `HTTP 服务：${config.httpDomain}；将切换为集群配置。`
    : `JSF 服务：${config.jsfDomain}；将填写 JSF 服务提供者。`;
  config.profile = profile.value;
  pinRuleRow.hidden = isHttp;
  if (isHttp) pinRule.checked = false;
  renderPreview();
}

async function saveProfileSelection() {
  config.profile = profile.value;
  const saved = await chrome.storage.local.get('gatewayAutofillConfigByEnvironment');
  const configurations = saved.gatewayAutofillConfigByEnvironment || {};
  configurations[environmentKey] = { ...(configurations[environmentKey] || {}), profile: config.profile };
  await chrome.storage.local.set({ gatewayAutofillConfigByEnvironment: configurations });
}

function renderPreview() {
  const { data, errors } = parseTemplate(template.value);
  if (!template.value.trim()) { preview.textContent = '粘贴模板后会在此预览解析结果。'; preview.className = ''; return; }
  const summary = `API：${data.apiName || '—'}；${serviceType()}；敏感标签：${data.sensitiveTag || config.sensitiveTag}${data.tps ? `；TPS：${data.tps}` : ''}${data.assetOwner ? `；负责人：${data.assetOwner}` : ''}${data.cluster ? `；集群：${data.cluster}` : ''}`;
  preview.textContent = errors.length ? `${summary}。${errors.join(' ')}` : `${summary}。校验通过。`;
  preview.className = errors.length ? 'error' : 'ok';
}

async function saveConfig() {
  Object.entries(configInputs).forEach(([key, input]) => { config[key] = input.value.trim(); });
  config.profile = profile.value;
  const saved = await chrome.storage.local.get('gatewayAutofillConfigByEnvironment');
  const configurations = saved.gatewayAutofillConfigByEnvironment || {};
  configurations[environmentKey] = config;
  await chrome.storage.local.set({
    gatewayAutofillConfigByEnvironment: configurations,
    gatewayAutofillEnvironmentSchema: '0.3.5'
  });
  renderProfile(); show('默认值已保存到此浏览器。');
}

async function initialise() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const host = new URL(tab?.url || 'http://invalid/').hostname;
  environmentKey = host === 'gateway.jdl.com' ? 'production' : 'uat';
  const saved = await chrome.storage.local.get([
    'gatewayAutofillConfig', 'gatewayAutofillConfigByEnvironment', 'gatewayAutofillEnvironmentSchema'
  ]);
  const legacyConfig = { ...(saved.gatewayAutofillConfig || {}) };
  delete legacyConfig.businessGroup;
  const stored = { ...(saved.gatewayAutofillConfigByEnvironment || {}) };
  if (saved.gatewayAutofillEnvironmentSchema !== '0.3.5' && stored.uat?.businessGroup === 'jdl_crm - 新CRM') {
    delete stored.uat.businessGroup;
  }
  const configurations = {
    uat: { ...ENVIRONMENT_DEFAULTS.uat, ...legacyConfig, ...(stored.uat || {}) },
    production: { ...ENVIRONMENT_DEFAULTS.production, ...legacyConfig, ...(stored.production || {}) }
  };
  if (saved.gatewayAutofillEnvironmentSchema !== '0.3.5') {
    await chrome.storage.local.set({
      gatewayAutofillConfigByEnvironment: configurations,
      gatewayAutofillEnvironmentSchema: '0.3.5'
    });
  }
  config = { ...ENVIRONMENT_DEFAULTS[environmentKey], ...(configurations[environmentKey] || {}) };
  // Migrate saved v0.2.0 preset identifiers without requiring the user to reset settings.
  if (config.profile === 'crm-jsf-uat') config.profile = 'crm-jsf';
  if (config.profile === 'crm-http-uat') config.profile = 'crm-http';
  profile.value = config.profile;
  environment.textContent = host === 'uat-gateway.jdl.com' ? '当前环境：预发网关' : host === 'gateway.jdl.com' ? '当前环境：线上网关' : '当前环境：请打开网关页面';
  Object.entries(configInputs).forEach(([key, input]) => { input.value = config[key]; });
  renderProfile();
}

template.addEventListener('input', renderPreview);
profile.addEventListener('change', () => {
  renderProfile();
  saveProfileSelection().catch(error => show(`预设保存失败：${error.message}`, true));
});
document.querySelector('#saveSettings').addEventListener('click', saveConfig);
document.querySelectorAll('[data-template]').forEach(button => button.addEventListener('click', async () => {
  const text = TEMPLATE_TEXTS[button.dataset.template];
  await navigator.clipboard.writeText(text);
    showToast('已复制成功');
}));

button.addEventListener('click', async () => {
  const { errors } = parseTemplate(template.value);
  if (!template.value.trim()) return show('请先粘贴接口模板。', true);
  if (errors.length) return show(`请修正模板：${errors.join(' ')}`, true);
  button.disabled = true;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !/^https?:\/\/(uat-)?gateway\.jdl\.com\//.test(tab.url || '')) throw new Error('请先切换到预发或线上网关的 API 新增页面。');
    const result = await chrome.tabs.sendMessage(tab.id, { type: 'gateway-autofill', text: template.value, addPinRule: serviceType() === 'JSF服务' && pinRule.checked, serviceType: serviceType(), config });
    if (!result?.ok) throw new Error(result?.error || '未找到 API 新增表单。');
    show(`已填写：${result.filled.join('、')}。${result.missing.length ? `未定位：${result.missing.join('、')}` : '请确认后手动保存。'}`);
  } catch (error) { show(error.message, true); } finally { button.disabled = false; }
});

initialise();
