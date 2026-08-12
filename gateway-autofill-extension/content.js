(() => {
  const normalise = (text) => String(text || '').replace(/[\s：:]/g, '').toLowerCase();

  function parse(text, serviceType = 'JSF服务') {
    const values = {};
    const keyMap = {
      '接口签名': 'signature', 'jsf接口签名': 'signature', '应用': 'app', '应用名': 'app', '应用名称': 'app',
      '别名': 'alias', 'jsf别名': 'alias', 'jsf校验token': 'jsfToken', 'api名称': 'apiName', '接口名称': 'apiName', 'url': 'url',
      'tps峰值': 'tps', '资产负责人': 'assetOwner', '敏感标签': 'sensitiveTag',
      '集群': 'cluster', '集群名称': 'cluster', '选择集群': 'cluster'
    };
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line) continue;
      const match = line.match(/^\s*([^：:]+?)\s*[：:]\s*(.*?)\s*$/i);
      if (!match) continue;
      const key = keyMap[normalise(match[1])];
      if (key && match[2]) values[key] = match[2].trim();
    }
    const required = serviceType === 'HTTP服务' ? ['app', 'apiName', 'url', 'cluster'] : ['signature', 'app', 'alias', 'apiName', 'url'];
    if (required.some(key => !values[key])) throw new Error(`模板须包含：${serviceType === 'HTTP服务' ? '应用名称、API名称、URL、集群' : '接口签名、应用名称、JSF别名、API名称、URL'}。`);
    const signature = values.signature?.replace(/^\s+|\s+$/g, '') || '';
    const hash = signature.lastIndexOf('#');
    if (serviceType !== 'HTTP服务' && (hash < 1 || hash === signature.length - 1)) throw new Error('接口签名格式应为：包名.接口名#方法名。');
    if (!values.cluster) {
      const clusterMatch = text.match(/选中\s*([a-zA-Z0-9_.-]+)\s*集群/i);
      if (clusterMatch) values.cluster = clusterMatch[1];
    }
    return { ...values, jsfInterface: hash > 0 ? signature.slice(0, hash) : '', jsfMethod: hash > 0 ? signature.slice(hash + 1) : '' };
  }

  function visible(element) {
    if (!(element instanceof Element)) return false;
    const style = getComputedStyle(element);
    return style.display !== 'none' && style.visibility !== 'hidden' && element.getClientRects().length > 0;
  }

  function controlsIn(root) {
    return [...root.querySelectorAll('input:not([type=hidden]), textarea, select')].filter(visible);
  }

  // Compatible with Vue/React controlled inputs: uses the native setter then emits input/change.
  function setValue(control, value) {
    const prototype = control instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
    setter ? setter.call(control, value) : (control.value = value);
    control.dispatchEvent(new Event('input', { bubbles: true }));
    control.dispatchEvent(new Event('change', { bubbles: true }));
    control.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'Tab' }));
    control.dispatchEvent(new Event('blur', { bubbles: true }));
  }

  function matchingLabel(label) {
    const target = label.htmlFor && document.getElementById(label.htmlFor);
    if (target && visible(target)) return target;
    const own = controlsIn(label)[0];
    if (own) return own;
    let parent = label.parentElement;
    for (let level = 0; parent && level < 4; level++, parent = parent.parentElement) {
      const controls = controlsIn(parent);
      if (controls.length) return controls[0];
    }
  }

  function findControl(labelText, kind = 'text') {
    const wanted = normalise(labelText);
    const labels = [...document.querySelectorAll('label, .form-label, .control-label, .el-form-item__label')];
    for (const label of labels) {
      if (!normalise(label.textContent).includes(wanted)) continue;
      const control = matchingLabel(label);
      if (control && (kind === 'any' || control.matches('input, textarea, select'))) return control;
    }
    // Legacy gateway forms commonly use a text node in a sibling cell rather than a <label>.
    const nodes = [...document.querySelectorAll('span, div, td, th')].filter(el => normalise(el.textContent) === wanted && visible(el));
    for (const node of nodes) {
      let parent = node.parentElement;
      for (let level = 0; parent && level < 4; level++, parent = parent.parentElement) {
        const control = controlsIn(parent)[0];
        if (control) return control;
      }
    }
  }

  function fill(label, value) {
    const control = findControl(label);
    if (!control) return false;
    setValue(control, value);
    return true;
  }

  function fillVisibleSelector(selector, value) {
    const control = [...document.querySelectorAll(selector)].find(visible);
    if (!control) return false;
    setValue(control, value);
    return true;
  }

  function clickFormGroupOption(groupLabel, optionText) {
    const wantedGroup = normalise(groupLabel);
    const wantedOption = normalise(optionText);
    const headings = [...document.querySelectorAll('#domainApiEditModal label, #domainApiEditModal span, #domainApiEditModal div')]
      .filter(element => visible(element) && normalise(element.textContent) === wantedGroup)
      .sort((a, b) => a.querySelectorAll('*').length - b.querySelectorAll('*').length);
    for (const heading of headings) {
      for (let root = heading; root; root = root.parentElement) {
        const option = [...root.querySelectorAll('label, span, div')].find(element =>
          visible(element) && normalise(element.textContent) === wantedOption
        );
        if (!option) continue;
        const input = option.querySelector('input[type=radio], input[type=checkbox]')
          || (option.htmlFor && document.getElementById(option.htmlFor));
        if (input instanceof HTMLInputElement) {
          if (!input.checked) input.click();
          return input.checked;
        }
        option.click();
        return true;
      }
    }
    return false;
  }

  function clickOption(groupLabel, optionText) {
    const wantedGroup = normalise(groupLabel), wantedOption = normalise(optionText);
    const optionMatches = text => {
      const candidate = normalise(text);
      return candidate === wantedOption || candidate.startsWith(`${wantedOption}(`) || wantedOption.startsWith(`${candidate}(`);
    };
    const groupHeading = [...document.querySelectorAll('label, .form-label, .control-label, .el-form-item__label')]
      .find(label => normalise(label.textContent) === wantedGroup);
    const group = groupHeading?.closest('.form-group');
    if (group) {
      const matchedInput = [...group.querySelectorAll('input[type=radio], input[type=checkbox]')].find(input => {
        const label = input.closest('label') || (input.id && group.querySelector(`label[for="${input.id}"]`));
        return label && optionMatches(label.textContent);
      });
      if (matchedInput instanceof HTMLInputElement) {
        if (!matchedInput.checked) matchedInput.click();
        return matchedInput.checked;
      }
    }
    const candidates = [...document.querySelectorAll('label, span, div')].filter(element =>
      visible(element) && optionMatches(element.textContent)
    );
    const option = candidates.find(element => {
      let parent = element.parentElement;
      for (let i = 0; parent && i < 5; i++, parent = parent.parentElement) if (normalise(parent.textContent).includes(wantedGroup)) return true;
      return false;
    });
    if (!option) return false;
    let input = option.querySelector('input') || (option.htmlFor && document.getElementById(option.htmlFor));
    for (let parent = option.parentElement, level = 0; !input && parent && level < 3; parent = parent.parentElement, level++) {
      const controls = [...parent.querySelectorAll('input[type=radio], input[type=checkbox]')];
      if (controls.length === 1) input = controls[0];
    }
    if (input instanceof HTMLInputElement && !input.checked) input.click();
    else option.click();
    return input instanceof HTMLInputElement ? input.checked : true;
  }

  function setCheckbox(labelText, checked) {
    const control = findControl(labelText);
    if (!(control instanceof HTMLInputElement) || control.type !== 'checkbox') return false;
    if (control.checked !== checked) control.click();
    return control.checked === checked;
  }

  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

  function selectOptions(control) {
    if (!(control instanceof HTMLSelectElement)) return [];
    return [...control.options]
      .map(option => ({ text: option.textContent.trim(), value: option.value }))
      .filter(option => option.text && option.value);
  }

  function visibleSelect(selector) {
    return [...document.querySelectorAll(selector)].find(control => control instanceof HTMLSelectElement && visible(control));
  }

  function selectByText(control, text) {
    if (!(control instanceof HTMLSelectElement)) return false;
    const option = [...control.options].find(item => normalise(item.textContent) === normalise(text));
    if (!option) return false;
    control.value = option.value;
    control.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  async function waitForOptionsChange(control, previousOptions) {
    const previous = JSON.stringify(previousOptions);
    for (let attempt = 0; attempt < 30; attempt++) {
      await wait(100);
      const current = selectOptions(control);
      if (current.length && JSON.stringify(current) !== previous) return current;
    }
    return selectOptions(control);
  }

  async function readGatewayDropdownOptions(groupText, domainText) {
    const groupControl = visibleSelect('#domain-api-edit-group');
    const domainControl = visibleSelect('#domain-api-edit-domain');
    const typeControl = visibleSelect('#domain-api-edit-type');
    if (!groupControl || !domainControl || !typeControl) throw new Error('未找到 API 新增表单，请先点击“新建”。');
    if (groupText && normalise(groupText) !== normalise(groupControl.selectedOptions[0]?.textContent)) {
      const domainsBefore = selectOptions(domainControl);
      if (!selectByText(groupControl, groupText)) throw new Error(`未找到业务分组：${groupText}`);
      await waitForOptionsChange(domainControl, domainsBefore);
    }
    if (domainText && normalise(domainText) !== normalise(domainControl.selectedOptions[0]?.textContent)) {
      const typesBefore = selectOptions(typeControl);
      if (!selectByText(domainControl, domainText)) throw new Error(`未找到服务域：${domainText}`);
      await waitForOptionsChange(typeControl, typesBefore);
    }
    return {
      groups: selectOptions(groupControl),
      domains: selectOptions(domainControl),
      types: selectOptions(typeControl),
      selectedGroup: groupControl.selectedOptions[0]?.textContent.trim() || '',
      selectedDomain: domainControl.selectedOptions[0]?.textContent.trim() || ''
    };
  }

  async function selectDropdown(label, optionText) {
    const control = findControl(label);
    if (!control) return false;
    if (control instanceof HTMLSelectElement) {
      const option = [...control.options].find(item => normalise(item.textContent) === normalise(optionText));
      if (!option) return false;
      control.value = option.value;
      control.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }

    // Gateway uses a custom select: click its visible input/container, then its
    // popup option. Retry because the list is rendered asynchronously.
    (control.closest('.select2-container, .el-select, .ant-select, [role=combobox]') || control.parentElement || control).click();
    const wanted = normalise(optionText);
    for (let attempt = 0; attempt < 12; attempt++) {
      await wait(100);
      const candidates = [...document.querySelectorAll('[role=option], li, div, span, a')]
        .filter(element => {
          const candidate = normalise(element.textContent);
          return visible(element) && (candidate === wanted || candidate.includes(wanted));
        })
        .sort((a, b) => a.querySelectorAll('*').length - b.querySelectorAll('*').length);
      const option = candidates[0];
      if (option) {
        option.click();
        return true;
      }
    }
    return false;
  }

  async function selectSensitiveTag(optionText) {
    const control = findControl('敏感标签');
    if (!control) return false;
    (control.closest('.select2-container, .el-select, .ant-select, [role=combobox]') || control.parentElement || control).click();
    const wanted = normalise(optionText);
    for (let attempt = 0; attempt < 12; attempt++) {
      await wait(100);
      const tagNode = [...document.querySelectorAll('.el-cascader-node')].find(node => {
        const label = node.querySelector('.el-cascader-node__label');
        const labelText = normalise(label?.textContent);
        return visible(node) && (labelText === wanted || labelText.startsWith(wanted));
      });
      if (tagNode) {
        const box = tagNode.querySelector('input[type=checkbox]');
        const checkboxVisual = tagNode.querySelector('.el-checkbox__inner');
        if (box instanceof HTMLInputElement && box.type === 'checkbox') {
          if (!box.checked) (checkboxVisual || box).click();
          await wait(50);
          return box.checked;
        }
      }
      // The second-level ToB node does not exist until the actual arrow is
      // clicked. Synthetic hover is insufficient for this Element UI cascader.
      const category = [...document.querySelectorAll('.el-cascader-node')].find(node =>
        visible(node) && normalise(node.querySelector('.el-cascader-node__label')?.textContent) === normalise('接口属性')
      );
      const arrow = category?.querySelector('.el-cascader-node__postfix');
      if (arrow && category?.getAttribute('aria-expanded') !== 'true') {
        arrow.click();
        await wait(120);
        continue;
      }
      if (!tagNode) continue;
      const box = tagNode.querySelector('input[type=checkbox]');
      if (box instanceof HTMLInputElement && box.type === 'checkbox') {
        if (!box.checked) box.click();
        return box.checked;
      }
    }
    return false;
  }

  async function addPinRule(rule = {}) {
    const positionValue = String(rule.position || '1').trim();
    const nameValue = String(rule.name || 'pin').trim();
    const fillById = () => {
      const position = document.querySelector('#rule-target-arg_index1');
      const name = document.querySelector('#rule-target-attr_name1');
      if (!visible(position) || !visible(name)) return false;
      setValue(position, positionValue);
      setValue(name, nameValue);
      return true;
    };
    const findRuleFields = () => ({ position: findControl('参数位置'), name: findControl('参数名称') });
    const fillExisting = () => {
      const { position, name } = findRuleFields();
      if (!position || !name) return false;
      setValue(position, positionValue);
      setValue(name, nameValue);
      return true;
    };
    if (fillById() || fillExisting()) return true;
    // This area is only visible after the JSF service form has finished
    // switching. Wait for that transition instead of treating a hidden toggle
    // as a missing parameter-rule feature.
    for (let attempt = 0; attempt < 15; attempt++) {
      const serviceType = document.querySelector('#domain-api-edit-type');
      const toggle = document.querySelector('#arg-replace-wrapper-btn');
      if (serviceType?.value === '1' && visible(toggle)) break;
      await wait(100);
    }
    const toggle = document.querySelector('#arg-replace-wrapper-btn');
    const addButton = document.querySelector('#arg-replace-wrapper .add-rule-btn');
    const wrapper = document.querySelector('#arg-replace-wrapper');
    if (toggle && addButton) {
      if (!visible(wrapper)) toggle.click();
      for (let attempt = 0; attempt < 12; attempt++) {
        await wait(100);
        if (!visible(wrapper)) {
          toggle.click();
          continue;
        }
        if (visible(addButton)) addButton.click();
        await wait(120);
        if (fillById() || fillExisting()) return true;
      }
      return false;
    }
    const header = [...document.querySelectorAll('h1, h2, h3, h4, h5, div, span, td, th')]
      .filter(el => normalise(el.textContent).includes('参数替换规则配置') && visible(el))
      .sort((a, b) => a.querySelectorAll('*').length - b.querySelectorAll('*').length)[0];
    if (!header) return false;
    for (let attempt = 0; attempt < 12; attempt++) {
      let section = header;
      let add;
      for (let level = 0; section && level < 7 && !add; level++, section = section.parentElement) {
        add = [...section.querySelectorAll('button, a, [role=button], span, div')].find(el =>
          normalise(el.textContent) === '添加' && visible(el) && !el.querySelector('button, a, [role=button]')
        );
      }
      if (!add) return false;
      const clickTarget = add.closest('button, a, [role=button]') || add;
      clickTarget.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
      await wait(180);
      if (fillExisting()) return true;
    }
    return false;
  }

  chrome.runtime.onMessage.addListener((message, _sender, respond) => {
    if (message.type === 'gateway-read-dropdown-options') {
      (async () => {
        try {
          respond({ ok: true, ...(await readGatewayDropdownOptions(message.group, message.domain)) });
        } catch (error) {
          respond({ ok: false, error: error.message });
        }
      })();
      return true;
    }
    if (message.type !== 'gateway-autofill') return;
    (async () => {
      try {
        const serviceType = message.serviceType;
        if (!['JSF服务', 'HTTP服务'].includes(serviceType)) throw new Error(`暂不支持自动填写“${serviceType || '未选择'}”类型。`);
        const data = parse(message.text, serviceType);
        const config = {
          businessGroup: '', serviceDomain: '', jsfDomain: '', httpDomain: '',
          sensitiveTag: 'ToB', apiType: '查询', flowType: 'ToB(商家)', ...(message.config || {})
        };
        const fields = [
          ['API名称', data.apiName], ['URL', data.url], ['路由标识', data.url], ['业务描述', data.apiName],
          ['TPS峰值', data.tps], ['资产负责人', data.assetOwner]
        ];
        const filled = [], missing = [];
        fields.filter(([, value]) => value).forEach(([name, value]) => (fill(name, value) ? filled : missing).push(name));
        // 服务域是业务分组联动项；必须等待前者选择完成和下拉数据刷新后，
        // 才能打开服务域列表。服务类型则最后选择，确保下方提供者区域正确切换。
        const groupSelected = await selectDropdown('业务分组', config.businessGroup);
        if (groupSelected) filled.push('业务分组'); else missing.push('业务分组');
        await wait(350);
        const domain = config.serviceDomain || (serviceType === 'HTTP服务' ? config.httpDomain : config.jsfDomain);
        const domainSelected = await selectDropdown('服务域', domain);
        if (domainSelected) filled.push('服务域'); else missing.push('服务域');
        await wait(150);
        const typeSelected = await selectDropdown('服务类型', serviceType);
        if (typeSelected) filled.push('服务类型'); else missing.push('服务类型');
        if (serviceType === 'JSF服务') {
          [
            ['JSF接口名', data.jsfInterface], ['JSF别名', data.alias], ['JSF方法名', data.jsfMethod]
          ].forEach(([name, value]) => (fill(name, value) ? filled : missing).push(name));
          if (!data.jsfToken || fillVisibleSelector('.cluster-router-token', data.jsfToken)) filled.push('JSF校验token'); else missing.push('JSF校验token');
          if (fillVisibleSelector('#jsf-api-app-name', data.app)) filled.push('应用名称'); else missing.push('应用名称');
        } else {
          await wait(250);
          if (await selectDropdown('选择集群', data.cluster) || await selectDropdown('选择或添加集群', data.cluster)) filled.push('集群'); else missing.push('集群');
          if (fill('应用名称', data.app)) filled.push('应用名称'); else missing.push('应用名称');
        }
        const tag = data.sensitiveTag || config.sensitiveTag;
        if (await selectSensitiveTag(tag)) filled.push('敏感标签'); else missing.push('敏感标签');
        [['接口类型', config.apiType], ['流量类型', config.flowType], ['是否支持mock', '否'], ['用户类型', '京东员工(ERP登录)'], ['接口等级', '1'], ['允许匿名访问', '否']]
          .forEach(([group, choice]) => clickOption(group, choice));
        // “是否订单相关”复用了其他标签 ID，不能按页面文字通用匹配。
        // 线上网关中 C00006 的值 18 是“否”。
        const orderRelatedNo = document.querySelector('input[name="C00006"][value="18"]');
        if (orderRelatedNo instanceof HTMLInputElement) {
          if (!orderRelatedNo.checked) orderRelatedNo.click();
          if (orderRelatedNo.checked) filled.push('是否订单相关'); else missing.push('是否订单相关');
        } else if (clickFormGroupOption('是否订单相关', '否')) filled.push('是否订单相关'); else missing.push('是否订单相关');
        if (setCheckbox('允许匿名访问', true)) filled.push('允许匿名访问'); else missing.push('允许匿名访问');
        if (message.addPinRule) {
          if (await addPinRule(message.parameterRule)) filled.push('参数替换规则'); else missing.push('参数替换规则');
        }
        // 网关在服务类型、标签和参数规则联动期间会重置 JSF 应用名称；
        // 全部联动结束后再回填一次，确保最终页面值正确。
        if (serviceType === 'JSF服务') {
          await wait(100);
          if (!fillVisibleSelector('#jsf-api-app-name', data.app) && !missing.includes('应用名称')) missing.push('应用名称');
        }
        respond({ ok: true, filled, missing });
      } catch (error) {
        respond({ ok: false, error: error.message });
      }
    })();
    return true;
  });
})();
