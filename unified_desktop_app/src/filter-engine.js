/**
 * Filter Engine for Bundler App
 * Node.js compatible module for filtering XML records based on filter configuration
 */

/**
 * Apply filter configuration to data forms
 * @param {Array} dataForms - Array of XML data form objects
 * @param {Array} filterGroups - Array of filter group configurations
 * @returns {Array} Filtered array of data forms
 */
function applyFilters(dataForms, filterGroups) {
  // If no filter groups defined, return all records
  if (!filterGroups || filterGroups.length === 0) {
    return dataForms;
  }
  
  // Filter groups are combined with AND logic
  // A record must pass ALL filter groups to be included
  return dataForms.filter(form => {
    return filterGroups.every(group => evaluateFilterGroup(form, group));
  });
}

/**
 * Evaluate a single filter group against a data form
 * @param {Object} form - XML data form object
 * @param {Object} group - Filter group configuration
 * @returns {Boolean} True if form passes the group's conditions
 */
function evaluateFilterGroup(form, group) {
  if (!group.items || group.items.length === 0) {
    return true; // Empty group passes all records
  }
  
  const logic = group.logic || 'AND';
  
  if (logic === 'AND') {
    // All items must be true
    return group.items.every(item => {
      if (item.type === 'condition') {
        return evaluateCondition(form, item);
      } else if (item.type === 'group') {
        return evaluateFilterGroup(form, item);
      }
      return true;
    });
  } else {
    // OR: At least one item must be true
    return group.items.some(item => {
      if (item.type === 'condition') {
        return evaluateCondition(form, item);
      } else if (item.type === 'group') {
        return evaluateFilterGroup(form, item);
      }
      return false;
    });
  }
}

/**
 * Evaluate a single condition against a data form
 * @param {Object} form - XML data form object
 * @param {Object} condition - Filter condition configuration
 * @returns {Boolean} True if form passes the condition
 */
function evaluateCondition(form, condition) {
  if (!condition.field || !condition.operator) {
    return true; // Invalid condition passes by default
  }
  
  const fieldValue = form[condition.field];
  const fieldStr = fieldValue != null ? String(fieldValue).trim() : '';
  
  let result = false;
  
  switch (condition.operator) {
    case 'equals':
      result = fieldStr.toLowerCase() === (condition.value || '').toLowerCase();
      break;
      
    case 'not_equals':
      result = fieldStr.toLowerCase() !== (condition.value || '').toLowerCase();
      break;
      
    case 'contains':
      result = fieldStr.toLowerCase().includes((condition.value || '').toLowerCase());
      break;
      
    case 'not_contains':
      result = !fieldStr.toLowerCase().includes((condition.value || '').toLowerCase());
      break;
      
    case 'starts_with':
      result = fieldStr.toLowerCase().startsWith((condition.value || '').toLowerCase());
      break;
      
    case 'ends_with':
      result = fieldStr.toLowerCase().endsWith((condition.value || '').toLowerCase());
      break;
      
    case 'empty':
      result = fieldStr === '';
      break;
      
    case 'not_empty':
      result = fieldStr !== '';
      break;
      
    case 'in_list':
      result = condition.listValues && Array.isArray(condition.listValues) && condition.listValues.includes(fieldStr);
      break;
      
    case 'not_in_list':
      result = condition.listValues && Array.isArray(condition.listValues) && !condition.listValues.includes(fieldStr);
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

module.exports = {
  applyFilters,
  evaluateFilterGroup,
  evaluateCondition,
};
