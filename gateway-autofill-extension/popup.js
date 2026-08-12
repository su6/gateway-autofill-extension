const COMMON_DEFAULTS = {
  serviceDomain: '', serviceType: 'JSF服务', sensitiveTag: 'ToB', apiType: '查询', flowType: 'ToB(商家)'
};
const ENVIRONMENT_DEFAULTS = {
  uat: { ...COMMON_DEFAULTS, businessGroup: '' },
  production: { ...COMMON_DEFAULTS, businessGroup: '' }
};
const template = document.querySelector('#template');
const button = document.querySelector('#fill');
const status = document.querySelector('#status');
const pinRule = document.querySelector('#pinRule');
const pinRuleRow = pinRule.closest('.rule');
const preview = document.querySelector('#preview');
const environment = document.querySelector('#environment');
const businessGroupInput = document.querySelector('#businessGroup');
const serviceDomainInput = document.querySelector('#serviceDomain');
const serviceTypeInput = document.querySelector('#serviceType');
const app = document.querySelector('#app');
const miniSettingsTrigger = document.querySelector('#miniSettingsTrigger');
const miniEnvironment = document.querySelector('#miniEnvironment');
const miniTaskDomain = document.querySelector('#miniTaskDomain');
const configPanel = document.querySelector('.config-panel');
const configCollapse = document.querySelector('#configCollapse');
const displayModeButtons = [...document.querySelectorAll('[data-display-mode]')];
const copyTemplateButton = document.querySelector('#copyTemplate');
const miniCopyTemplateButton = document.querySelector('#miniCopyTemplate');
const TEMPLATE_TEXTS = {
  jsf: `JSF\n接口签名: com.jdl.crm.customer.api.service.factoring.CrmFactoringApplyApi#getEnums\n应用名称: crm-customer\nJSF别名: crm-uat\nJSF校验token: 1234\nAPI名称: 保理申请页面枚举查询\nURL: /factoring/getEnums\nTPS峰值: 100\n资产负责人: bianlei5`,
  http: `HTTP\n应用名称: crm-customer\nAPI名称: 保理申请页面枚举查询\nURL: /factoring/getEnums\nTPS峰值: 100\n资产负责人: bianlei5\n集群: crm-customer`
};
const configInputs = ['sensitiveTag']
  .reduce((all, id) => ({ ...all, [id]: document.querySelector(`#${id}`) }), {});
let config = { ...ENVIRONMENT_DEFAULTS.uat };
let environmentKey = 'uat';
let dropdownOptions = { groups: [], domains: [], types: [] };
let selectedTemplate = 'jsf';
let displayMode = 'standard';
let configCollapsed = false;

function serviceType() { return serviceTypeInput.value; }
function show(message, error = false) { status.textContent = message; status.className = error ? 'error' : ''; }
function showToast(message) {
  const toast = document.querySelector('#toast');
  toast.textContent = message;
  toast.classList.add('visible');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove('visible'), 2000);
}
function renderTemplateChoice() {
  document.querySelectorAll('.template-tab').forEach(tab => {
    const active = tab.dataset.template === selectedTemplate;
    tab.classList.toggle('active', active);
    tab.setAttribute('aria-selected', String(active));
  });
  copyTemplateButton.textContent = `复制 ${selectedTemplate.toUpperCase()} 模板`;
  miniCopyTemplateButton.textContent = `复制 ${selectedTemplate.toUpperCase()} 模板`;
}
function renderDisplayMode() {
  const mini = displayMode === 'mini';
  app.classList.toggle('is-mini', mini);
  if (!mini) app.classList.remove('mini-settings-open');
  miniSettingsTrigger.setAttribute('aria-expanded', String(app.classList.contains('mini-settings-open')));
  displayModeButtons.forEach(item => {
    const selected = item.dataset.displayMode === displayMode;
    item.classList.toggle('active', selected);
    item.setAttribute('aria-pressed', String(selected));
  });
  renderTemplateChoice();
}
function renderConfigCollapse() {
  configPanel.classList.toggle('is-collapsed', configCollapsed);
  configCollapse.setAttribute('aria-expanded', String(!configCollapsed));
  configCollapse.querySelector('i').textContent = configCollapsed ? '⌄' : '⌃';
}
async function toggleConfigCollapse() {
  configCollapsed = !configCollapsed;
  renderConfigCollapse();
  await chrome.storage.local.set({ gatewayAutofillConfigCollapsed: configCollapsed });
}
async function changeDisplayMode(mode) {
  displayMode = mode === 'mini' ? 'mini' : 'standard';
  renderDisplayMode();
  await chrome.storage.local.set({ gatewayAutofillDisplayMode: displayMode });
}
function normalise(value) { return String(value || '').replace(/[\s：:]/g, '').toLowerCase(); }

function optionText(input) {
  return input.value ? input.selectedOptions[0]?.textContent.trim() || '' : '';
}

function renderSelect(input, options, selected, placeholder) {
  input.replaceChildren(new Option(placeholder, ''));
  const seen = new Set();
  options.forEach(({ text }) => {
    const value = String(text || '').trim();
    if (!value || seen.has(value)) return;
    seen.add(value);
    input.add(new Option(value, value));
  });
  input.value = seen.has(selected) ? selected : '';
}

async function getGatewayTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !/^https?:\/\/(uat-)?gateway\.jdl\.com\//.test(tab.url || '')) {
    throw new Error('请先切换到预发或线上网关的 API 新增页面。');
  }
  return tab;
}

async function readGatewayDropdowns(group, domain) {
  const tab = await getGatewayTab();
  const result = await chrome.tabs.sendMessage(tab.id, { type: 'gateway-read-dropdown-options', group, domain });
  if (!result?.ok) throw new Error(result?.error || '未读取到网关下拉选项。');
  return result;
}

function renderDomains(domains) {
  dropdownOptions.domains = domains || [];
  renderSelect(serviceDomainInput, dropdownOptions.domains, config.serviceDomain, '请选择服务域');
}

function renderServiceTypes(types) {
  dropdownOptions.types = types || [];
  renderSelect(serviceTypeInput, dropdownOptions.types, config.serviceType, '请选择服务类型');
}

async function loadServiceTypes(group, domain) {
  try {
    const result = await readGatewayDropdowns(group, domain);
    dropdownOptions.groups = result.groups || dropdownOptions.groups;
    renderSelect(businessGroupInput, dropdownOptions.groups, group, '请选择业务分组');
    renderDomains(result.domains);
    config.businessGroup = optionText(businessGroupInput);
    config.serviceDomain = optionText(serviceDomainInput);
    renderServiceTypes(result.types);
    renderServiceMode();
    if (!serviceType()) show('请选择服务类型；服务类型由当前服务域联动加载。');
  } catch (error) {
    renderServiceTypes([]);
    show(`服务类型读取失败：${error.message}`, true);
  }
}

async function loadDomains(group) {
  try {
    const result = await readGatewayDropdowns(group);
    dropdownOptions.groups = result.groups || dropdownOptions.groups;
    renderSelect(businessGroupInput, dropdownOptions.groups, group, '请选择业务分组');
    config.businessGroup = optionText(businessGroupInput);
    renderDomains(result.domains);
    const domain = dropdownOptions.domains.some(item => item.text === config.serviceDomain)
      ? config.serviceDomain
      : result.selectedDomain || '';
    if (domain) await loadServiceTypes(config.businessGroup, domain);
    else renderServiceTypes([]);
  } catch (error) {
    renderDomains([]);
    renderServiceTypes([]);
    show(`服务域读取失败：${error.message}`, true);
  }
}

async function loadGatewayDropdowns() {
  try {
    const result = await readGatewayDropdowns();
    dropdownOptions.groups = result.groups || [];
    const group = dropdownOptions.groups.some(item => item.text === config.businessGroup)
      ? config.businessGroup
      : result.selectedGroup || '';
    renderSelect(businessGroupInput, dropdownOptions.groups, group, '请选择业务分组');
    if (group) await loadDomains(group);
    else { renderDomains([]); renderServiceTypes([]); }
  } catch (error) {
    renderSelect(businessGroupInput, [], '', '请打开 API 新增页面后重试');
    renderDomains([]);
    renderServiceTypes([]);
    show(`下拉选项读取失败：${error.message}`, true);
  }
}

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
  const errors = missing.length ? [`缺少：${missing.map(key => ({ signature: '接口签名', app: '应用', alias: '别名', apiName: 'API名称', url: 'URL', cluster: '集群' })[key]).join('、')}`] : [];
  if (serviceType() !== 'HTTP服务' && data.signature && !/^.+#.+$/.test(data.signature)) errors.push('接口签名应为“包名.接口名#方法名”。');
  if (data.tps && !/^\d+(\.\d+)?$/.test(data.tps)) errors.push('TPS峰值应为数字。');
  return { data, errors };
}

function renderServiceMode() {
  pinRuleRow.hidden = serviceType() !== 'JSF服务';
  renderDomains(dropdownOptions.domains);
  renderServiceTypes(dropdownOptions.types);
  renderPreview();
}

function renderPreview() {
  if (!template.value.trim()) { preview.textContent = '粘贴模板后会在此预览解析结果。'; preview.className = ''; return; }
  if (!serviceType()) { preview.textContent = '请先选择服务类型；该列表由当前服务域联动加载。'; preview.className = 'error'; return; }
  const { data, errors } = parseTemplate(template.value);
  const summary = `API：${data.apiName || '—'}；${serviceType() || '未选择服务类型'}；敏感标签：${data.sensitiveTag || config.sensitiveTag}${data.tps ? `；TPS：${data.tps}` : ''}${data.assetOwner ? `；负责人：${data.assetOwner}` : ''}${data.cluster ? `；集群：${data.cluster}` : ''}`;
  preview.textContent = errors.length ? `${summary}。${errors.join(' ')}` : `${summary}。校验通过。`;
  preview.className = errors.length ? 'error' : 'ok';
}

async function saveConfig() {
  Object.entries(configInputs).forEach(([key, input]) => { config[key] = input.value.trim(); });
  config.businessGroup = optionText(businessGroupInput);
  config.serviceDomain = optionText(serviceDomainInput);
  config.serviceType = serviceType();
  const saved = await chrome.storage.local.get('gatewayAutofillConfigByEnvironment');
  const configurations = saved.gatewayAutofillConfigByEnvironment || {};
  configurations[environmentKey] = config;
  await chrome.storage.local.set({
    gatewayAutofillConfigByEnvironment: configurations,
    gatewayAutofillEnvironmentSchema: '0.3.18'
  });
  renderServiceMode(); show('默认配置已保存到此浏览器。');
}

async function initialise() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const host = new URL(tab?.url || 'http://invalid/').hostname;
  environmentKey = host === 'gateway.jdl.com' ? 'production' : 'uat';
  const saved = await chrome.storage.local.get([
    'gatewayAutofillConfig', 'gatewayAutofillConfigByEnvironment', 'gatewayAutofillEnvironmentSchema', 'gatewayAutofillDisplayMode', 'gatewayAutofillConfigCollapsed'
  ]);
  const legacyConfig = { ...(saved.gatewayAutofillConfig || {}) };
  delete legacyConfig.businessGroup;
  const stored = { ...(saved.gatewayAutofillConfigByEnvironment || {}) };
  const configurations = {
    uat: { ...ENVIRONMENT_DEFAULTS.uat, ...legacyConfig, ...(stored.uat || {}) },
    production: { ...ENVIRONMENT_DEFAULTS.production, ...legacyConfig, ...(stored.production || {}) }
  };
  Object.values(configurations).forEach(item => {
    if (!item.serviceDomain) item.serviceDomain = item.profile === 'crm-http' ? item.httpDomain || item.jsfDomain || '' : item.jsfDomain || item.httpDomain || '';
  });
  if (saved.gatewayAutofillEnvironmentSchema !== '0.3.18') {
    await chrome.storage.local.set({
      gatewayAutofillConfigByEnvironment: configurations,
      gatewayAutofillEnvironmentSchema: '0.3.18'
    });
  }
  config = { ...ENVIRONMENT_DEFAULTS[environmentKey], ...(configurations[environmentKey] || {}) };
  if (!config.serviceType) config.serviceType = config.profile === 'crm-http' ? 'HTTP服务' : 'JSF服务';
  displayMode = saved.gatewayAutofillDisplayMode === 'mini' ? 'mini' : 'standard';
  configCollapsed = saved.gatewayAutofillConfigCollapsed === true;
  environment.textContent = host === 'uat-gateway.jdl.com' ? '当前环境：预发网关' : host === 'gateway.jdl.com' ? '当前环境：线上网关' : '当前环境：请打开网关页面';
  miniEnvironment.textContent = host === 'uat-gateway.jdl.com' ? '预发网关' : host === 'gateway.jdl.com' ? '线上网关' : '请打开网关页面';
  Object.entries(configInputs).forEach(([key, input]) => { input.value = config[key]; });
  serviceTypeInput.value = config.serviceType;
  renderDisplayMode();
  renderConfigCollapse();
  renderTemplateChoice();
  renderServiceMode();
  await loadGatewayDropdowns();
  miniTaskDomain.textContent = optionText(serviceDomainInput) || '网关服务域';
}

template.addEventListener('input', renderPreview);
businessGroupInput.addEventListener('change', () => {
  const group = optionText(businessGroupInput);
  config.businessGroup = group;
  config.serviceDomain = '';
  loadDomains(group);
});
serviceDomainInput.addEventListener('change', () => {
  config.serviceDomain = optionText(serviceDomainInput);
  miniTaskDomain.textContent = config.serviceDomain || '网关服务域';
  loadServiceTypes(config.businessGroup, config.serviceDomain);
});
serviceTypeInput.addEventListener('change', () => {
  config.serviceType = serviceType();
  renderServiceMode();
});
document.querySelector('#saveSettings').addEventListener('click', saveConfig);
document.querySelectorAll('.template-tab').forEach(tab => tab.addEventListener('click', () => {
  selectedTemplate = tab.dataset.template;
  renderTemplateChoice();
  show('已选择参考模板；点击“复制当前模板”后到记事本修改。');
}));
async function copyCurrentTemplate() {
  const text = TEMPLATE_TEXTS[selectedTemplate];
  await navigator.clipboard.writeText(text);
  showToast('模板已复制，修改后粘贴到下方输入框。');
}
copyTemplateButton.addEventListener('click', copyCurrentTemplate);
miniCopyTemplateButton.addEventListener('click', copyCurrentTemplate);
displayModeButtons.forEach(item => item.addEventListener('click', () => changeDisplayMode(item.dataset.displayMode)));
miniSettingsTrigger.addEventListener('click', () => {
  app.classList.toggle('mini-settings-open');
  miniSettingsTrigger.setAttribute('aria-expanded', String(app.classList.contains('mini-settings-open')));
});
configCollapse.addEventListener('click', toggleConfigCollapse);

button.addEventListener('click', async () => {
  if (!serviceType()) return show('请先在默认配置中选择服务类型。', true);
  if (!['JSF服务', 'HTTP服务'].includes(serviceType())) return show(`暂不支持自动填写“${serviceType()}”类型。`, true);
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
