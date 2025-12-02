// Filter management functions for bundler app

/**
 * Add a new filter group or nested subgroup
 * @param {number} parentGroupId - ID of parent group (undefined for top-level)
 */
function addFilterGroup(parentGroupId) {
  const groupId = nextFilterGroupId++;
  
  const group = {
    id: groupId,
    type: 'group',
    logic: 'AND',
    items: [] // Can contain both conditions and nested groups
  };
  
  if (parentGroupId === undefined) {
    // Top-level group
    filterGroups.push(group);
  } else {
    // Nested group - find parent and add to its items
    const parent = findGroupById(parentGroupId);
    if (parent) {
      parent.items.push(group);
    }
  }
  
  renderFilterGroups();
}

/**
 * Remove a filter group (top-level or nested)
 */
function removeFilterGroup(groupId) {
  // Try removing from top level
  const index = filterGroups.findIndex(g => g.id === groupId);
  if (index !== -1) {
    filterGroups.splice(index, 1);
    renderFilterGroups();
    return;
  }
  
  // Try removing from nested groups
  if (removeNestedGroup(filterGroups, groupId)) {
    renderFilterGroups();
  }
}

/**
 * Helper to remove a nested group recursively
 */
function removeNestedGroup(items, groupId) {
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.type === 'group') {
      // Check if any child matches
      const childIndex = item.items.findIndex(child => child.type === 'group' && child.id === groupId);
      if (childIndex !== -1) {
        item.items.splice(childIndex, 1);
        return true;
      }
      // Recurse into nested groups
      if (removeNestedGroup(item.items, groupId)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Helper to find a group by ID (recursive)
 */
function findGroupById(groupId, items = filterGroups) {
  for (const item of items) {
    if (item.type === 'group' && item.id === groupId) {
      return item;
    }
    if (item.type === 'group' && item.items) {
      const found = findGroupById(groupId, item.items);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Add a condition to a filter group
 */
function addFilterCondition(groupId) {
  const group = findGroupById(groupId);
  if (!group) return;
  
  const conditionId = nextFilterConditionId++;
  
  const condition = {
    id: conditionId,
    type: 'condition',
    field: availableFields[0] || '',
    operator: 'equals',
    value: '',
    not: false,
    valueType: 'text' // 'text', 'list', 'regex'
  };
  
  group.items.push(condition);
  renderFilterGroups();
}

/**
 * Remove a condition from a filter group
 */
function removeFilterCondition(groupId, conditionId) {
  const group = findGroupById(groupId);
  if (!group) return;
  
  const index = group.items.findIndex(item => item.type === 'condition' && item.id === conditionId);
  if (index !== -1) {
    group.items.splice(index, 1);
    renderFilterGroups();
  }
}

/**
 * Update filter group logic (AND/OR)
 */
function updateFilterGroupLogic(groupId, logic) {
  const group = findGroupById(groupId);
  if (group) {
    group.logic = logic;
    
    // Refresh hierarchy to reflect new logic
    if (typeof refreshHierarchyCounts === 'function') {
      refreshHierarchyCounts();
    }
    
    // Update XML info
    updateXmlInfoWithFilters();
  }
}

/**
 * Update a filter condition
 */
function updateFilterCondition(groupId, conditionId, field, value) {
  const group = findGroupById(groupId);
  if (!group) return;
  
  const condition = group.items.find(item => item.type === 'condition' && item.id === conditionId);
  if (!condition) return;
  
  condition[field] = value;
  
  // If operator changed, update value type and re-render to show appropriate input
  if (field === 'operator') {
    if (value === 'in_list' || value === 'not_in_list') {
      condition.valueType = 'list';
      condition.listValues = [];
    } else if (value === 'regex') {
      condition.valueType = 'regex';
    } else {
      condition.valueType = 'text';
    }
    renderFilterGroups();
  } else if (field === 'field' || field === 'value' || field === 'not') {
    // Field, value, or NOT changed - refresh hierarchy
    if (typeof refreshHierarchyCounts === 'function') {
      refreshHierarchyCounts();
    }
    // Also update XML info
    updateXmlInfoWithFilters();
  }
}

/**
 * Render all filter groups
 */
function renderFilterGroups() {
  const container = document.getElementById('filterContainer');
  if (!container) return;
  
  if (filterGroups.length === 0) {
    container.innerHTML = '<p class="info" style="color: #999; text-align: center; margin: 20px 0;">No filters configured - all records will be included</p>';
    return;
  }
  
  let html = '';
  
  filterGroups.forEach((group, groupIndex) => {
    html += renderFilterGroup(group, groupIndex, 0, groupIndex > 0);
  });
  
  container.innerHTML = html;
  
  // Update XML info display with current filter status
  updateXmlInfoWithFilters();
  
  // Refresh hierarchy tree to reflect new filter
  if (typeof refreshHierarchyCounts === 'function') {
    refreshHierarchyCounts();
  }
}

/**
 * Render a single filter group (recursive for nested groups)
 * @param {Object} group - The group to render
 * @param {number} groupIndex - Index in parent array
 * @param {number} depth - Nesting depth (0 for top-level)
 * @param {boolean} showAnd - Whether to show "AND" prefix
 */
function renderFilterGroup(group, groupIndex, depth = 0, showAnd = false) {
  const indent = depth * 20;
  const isNested = depth > 0;
  
  let html = `
    <div class="filter-group" data-group-id="${group.id}" style="margin-left: ${indent}px; ${isNested ? 'border-left: 3px solid #007bff; padding-left: 15px; margin-top: 10px;' : ''}">
      <div class="filter-group-header">
        <div class="filter-group-logic">
          ${showAnd ? `<strong>AND</strong>` : ''}
          <span style="font-weight: 600;">${isNested ? 'Nested ' : ''}Group ${groupIndex + 1}:</span>
          <select onchange="updateFilterGroupLogic(${group.id}, this.value)">
            <option value="AND" ${group.logic === 'AND' ? 'selected' : ''}>Match ALL</option>
            <option value="OR" ${group.logic === 'OR' ? 'selected' : ''}>Match ANY</option>
          </select>
        </div>
        <button class="filter-remove-btn" onclick="removeFilterGroup(${group.id})">Remove</button>
      </div>
      
      <div class="filter-conditions">
  `;
  
  // Render items (conditions and nested groups)
  group.items.forEach((item, itemIndex) => {
    if (item.type === 'condition') {
      html += renderFilterCondition(group.id, item, itemIndex, depth);
    } else if (item.type === 'group') {
      html += renderFilterGroup(item, itemIndex, depth + 1, itemIndex > 0);
    }
  });
  
  html += `
      </div>
      
      <div style="margin-top: 10px; display: flex; gap: 10px;">
        <button class="filter-add-condition" onclick="addFilterCondition(${group.id})">+ Add Condition</button>
        <button class="filter-add-condition" onclick="addFilterGroup(${group.id})" style="background: #007bff; border-color: #007bff;">+ Add Nested Group</button>
      </div>
    </div>
  `;
  
  return html;
}

/**
 * Render a single filter condition
 */
function renderFilterCondition(groupId, condition, index, depth = 0) {
  const operators = [
    { value: 'equals', label: 'Equals' },
    { value: 'not_equals', label: 'Not Equals' },
    { value: 'contains', label: 'Contains' },
    { value: 'not_contains', label: 'Does Not Contain' },
    { value: 'starts_with', label: 'Starts With' },
    { value: 'ends_with', label: 'Ends With' },
    { value: 'empty', label: 'Is Empty' },
    { value: 'not_empty', label: 'Is Not Empty' },
    { value: 'in_list', label: 'In List' },
    { value: 'not_in_list', label: 'Not In List' },
    { value: 'regex', label: 'Regex Match' }
  ];
  
  const fieldOptions = availableFields.map(f => 
    `<option value="${f}" ${condition.field === f ? 'selected' : ''}>${f}</option>`
  ).join('');
  
  const operatorOptions = operators.map(op => 
    `<option value="${op.value}" ${condition.operator === op.value ? 'selected' : ''}>${op.label}</option>`
  ).join('');
  
  const needsValue = !['empty', 'not_empty'].includes(condition.operator);
  
  let valueInput = '';
  if (needsValue) {
    if (condition.operator === 'in_list' || condition.operator === 'not_in_list') {
      valueInput = renderListValueInput(groupId, condition);
    } else if (condition.operator === 'regex') {
      valueInput = `
        <div class="filter-value-container">
          <input type="text" 
                 placeholder="Enter regex pattern" 
                 value="${condition.value || ''}"
                 onchange="updateFilterCondition(${groupId}, ${condition.id}, 'value', this.value)">
          <a href="https://regex101.com/?flavor=javascript" target="_blank" class="filter-regex-link">
            Open Regex Tester (JavaScript flavor)
          </a>
        </div>
      `;
    } else {
      valueInput = `
        <input type="text" 
               placeholder="Enter value" 
               value="${condition.value || ''}"
               onchange="updateFilterCondition(${groupId}, ${condition.id}, 'value', this.value)">
      `;
    }
  } else {
    valueInput = '<span style="color: #999; font-style: italic;">No value needed</span>';
  }
  
  return `
    <div class="filter-condition" data-condition-id="${condition.id}">
      <select onchange="updateFilterCondition(${groupId}, ${condition.id}, 'field', this.value)">
        ${fieldOptions}
      </select>
      
      <select onchange="updateFilterCondition(${groupId}, ${condition.id}, 'operator', this.value)">
        ${operatorOptions}
      </select>
      
      ${valueInput}
      
      <button class="filter-remove-btn" onclick="removeFilterCondition(${groupId}, ${condition.id})" style="padding: 6px 10px; font-size: 11px;">✕</button>
      
      <div class="filter-condition-not">
        <input type="checkbox" 
               id="not_${groupId}_${condition.id}"
               ${condition.not ? 'checked' : ''}
               onchange="updateFilterCondition(${groupId}, ${condition.id}, 'not', this.checked)">
        <label for="not_${groupId}_${condition.id}">Negate this condition (NOT)</label>
      </div>
    </div>
  `;
}

/**
 * Render list value input for IN LIST / NOT IN LIST operators
 */
function renderListValueInput(groupId, condition) {
  if (!condition.listValues) {
    condition.listValues = [];
  }
  
  // Get unique values from XML data for this field
  const uniqueValues = getUniqueFieldValues(condition.field);
  
  return `
    <div class="filter-value-container">
      <div id="list-count-${groupId}-${condition.id}" style="font-size: 12px; margin-bottom: 5px; color: #666;">
        Select values (${condition.listValues.length} selected):
      </div>
      <div class="filter-list-container">
        ${uniqueValues.length > 0 ? 
          uniqueValues.map(val => {
            const isChecked = condition.listValues.includes(val);
            const safeVal = val.replace(/"/g, '&quot;');
            return `
              <div class="filter-list-item">
                <input type="checkbox" 
                       id="list_${groupId}_${condition.id}_${safeVal}"
                       ${isChecked ? 'checked' : ''}
                       onchange="toggleListValue(${groupId}, ${condition.id}, '${safeVal}', this.checked)">
                <label for="list_${groupId}_${condition.id}_${safeVal}">${val}</label>
              </div>
            `;
          }).join('') 
          : '<p style="color: #999; font-size: 12px; margin: 5px 0;">Load XML file to see available values</p>'
        }
      </div>
    </div>
  `;
}

/**
 * Toggle a value in a list condition
 */
function toggleListValue(groupId, conditionId, value, checked) {
  const group = findGroupById(groupId);
  if (!group) return;
  
  const condition = group.items.find(item => item.type === 'condition' && item.id === conditionId);
  if (!condition) return;
  
  if (!condition.listValues) {
    condition.listValues = [];
  }
  
  if (checked) {
    if (!condition.listValues.includes(value)) {
      condition.listValues.push(value);
    }
  } else {
    const index = condition.listValues.indexOf(value);
    if (index !== -1) {
      condition.listValues.splice(index, 1);
    }
  }
  
  // Update the count display
  updateListValueCount(groupId, conditionId);
  
  // Refresh hierarchy to reflect new filter
  if (typeof refreshHierarchyCounts === 'function') {
    refreshHierarchyCounts();
  }
  
  // Update XML info
  updateXmlInfoWithFilters();
}

/**
 * Update the count display for a list condition
 */
function updateListValueCount(groupId, conditionId) {
  const group = findGroupById(groupId);
  if (!group) return;
  
  const condition = group.items.find(item => item.type === 'condition' && item.id === conditionId);
  if (!condition || !condition.listValues) return;
  
  // Find the count display element and update it
  const countElement = document.querySelector(`#list-count-${groupId}-${conditionId}`);
  if (countElement) {
    countElement.textContent = `Select values (${condition.listValues.length} selected):`;
  }
}

/**
 * Get unique values for a field from parsed XML data
 */
function getUniqueFieldValues(fieldName) {
  // Check if we have parsed data with records array (from parse-xml handler)
  if (parsedXmlData && Array.isArray(parsedXmlData.records)) {
    const values = new Set();
    
    parsedXmlData.records.forEach(record => {
      const value = record[fieldName];
      if (value !== undefined && value !== null && value !== '') {
        values.add(String(value));
      }
    });
    
    return Array.from(values).sort();
  }
  
  // Fallback: check if we have phon_data structure (legacy)
  if (parsedXmlData && parsedXmlData.phon_data && parsedXmlData.phon_data.data_form) {
    const dataForms = Array.isArray(parsedXmlData.phon_data.data_form) 
      ? parsedXmlData.phon_data.data_form 
      : [parsedXmlData.phon_data.data_form];
    
    const values = new Set();
    
    dataForms.forEach(form => {
      const value = form[fieldName];
      if (value !== undefined && value !== null && value !== '') {
        values.add(String(value));
      }
    });
    
    return Array.from(values).sort();
  }
  
  return [];
}

/**
 * Clear all filters
 */
function clearAllFilters() {
  if (filterGroups.length === 0) {
    return;
  }
  
  if (confirm('Are you sure you want to remove all filters?')) {
    filterGroups = [];
    renderFilterGroups();
    document.getElementById('filterTestResult').textContent = '';
  }
}

/**
 * Test filters against XML data
 */
async function testFilters() {
  if (!parsedXmlData || !parsedXmlData.records) {
    document.getElementById('filterTestResult').textContent = 'Load XML file first';
    document.getElementById('filterTestResult').style.color = '#dc3545';
    return;
  }
  
  const totalRecords = parsedXmlData.records.length;
  const filteredRecords = applyFilters(parsedXmlData.records);
  const passedCount = filteredRecords.length;
  
  const resultSpan = document.getElementById('filterTestResult');
  if (filterGroups.length === 0) {
    resultSpan.textContent = `No filters - all ${totalRecords} records included`;
    resultSpan.style.color = '#666';
  } else {
    resultSpan.textContent = `${passedCount} of ${totalRecords} records pass filters (${((passedCount/totalRecords)*100).toFixed(1)}%)`;
    resultSpan.style.color = passedCount > 0 ? '#28a745' : '#dc3545';
  }
}

/**
 * Update XML info display with filter status
 */
function updateXmlInfoWithFilters() {
  if (!parsedXmlData || !parsedXmlData.records) {
    return;
  }
  
  const totalRecords = parsedXmlData.records.length;
  const filteredRecords = applyFilters(parsedXmlData.records);
  const passedCount = filteredRecords.length;
  
  const xmlInfo = document.getElementById('xmlInfo');
  if (filterGroups.length === 0) {
    xmlInfo.textContent = `✓ Loaded ${totalRecords} records`;
    xmlInfo.style.color = 'green';
  } else {
    xmlInfo.textContent = `✓ Loaded ${totalRecords} records (${passedCount} match filters)`;
    xmlInfo.style.color = passedCount > 0 ? 'green' : 'orange';
  }
}

/**
 * Apply filters to data forms array
 * Returns filtered array
 */
function applyFilters(dataForms) {
  if (filterGroups.length === 0) {
    return dataForms;
  }
  
  return dataForms.filter(form => {
    // All top-level groups must pass (AND between groups)
    return filterGroups.every(group => evaluateGroup(form, group));
  });
}

/**
 * Evaluate a group (which may contain conditions and nested groups)
 */
function evaluateGroup(form, group) {
  if (group.items.length === 0) return true;
  
  const logic = group.logic || 'AND';
  
  if (logic === 'AND') {
    // All items must pass
    return group.items.every(item => {
      if (item.type === 'condition') {
        return evaluateCondition(form, item);
      } else if (item.type === 'group') {
        return evaluateGroup(form, item);
      }
      return true;
    });
  } else {
    // At least one item must pass (OR)
    return group.items.some(item => {
      if (item.type === 'condition') {
        return evaluateCondition(form, item);
      } else if (item.type === 'group') {
        return evaluateGroup(form, item);
      }
      return false;
    });
  }
}

/**
 * Evaluate a single filter condition against a data form
 */
function evaluateCondition(form, condition) {
  const fieldValue = form[condition.field];
  const fieldStr = fieldValue !== undefined && fieldValue !== null ? String(fieldValue) : '';
  
  let result = false;
  
  switch (condition.operator) {
    case 'equals':
      result = fieldStr === condition.value;
      break;
      
    case 'not_equals':
      result = fieldStr !== condition.value;
      break;
      
    case 'contains':
      result = fieldStr.toLowerCase().includes(condition.value.toLowerCase());
      break;
      
    case 'not_contains':
      result = !fieldStr.toLowerCase().includes(condition.value.toLowerCase());
      break;
      
    case 'starts_with':
      result = fieldStr.toLowerCase().startsWith(condition.value.toLowerCase());
      break;
      
    case 'ends_with':
      result = fieldStr.toLowerCase().endsWith(condition.value.toLowerCase());
      break;
      
    case 'empty':
      result = fieldStr === '';
      break;
      
    case 'not_empty':
      result = fieldStr !== '';
      break;
      
    case 'in_list':
      result = condition.listValues && condition.listValues.includes(fieldStr);
      break;
      
    case 'not_in_list':
      result = condition.listValues && !condition.listValues.includes(fieldStr);
      break;
      
    case 'regex':
      try {
        const regex = new RegExp(condition.value);
        result = regex.test(fieldStr);
      } catch (e) {
        console.error('Invalid regex:', condition.value, e);
        result = false;
      }
      break;
      
    default:
      result = false;
  }
  
  // Apply NOT if specified
  return condition.not ? !result : result;
}
