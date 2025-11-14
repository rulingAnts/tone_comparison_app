/**
 * Helper functions for completing the hierarchical bundle refactor
 * Add these to desktop_matching_app/src/main.js
 */

// ============================================================================
// Helper function: Get category field updates from hierarchy path
// ============================================================================
function getCategoryUpdatesForPath(targetPath, hierarchy) {
  const updates = {};
  
  if (!hierarchy || !hierarchy.tree) {
    return updates;
  }
  
  // Split path like "Noun/CVCV" into parts
  const pathParts = targetPath.split('/');
  
  // Walk the tree to find field assignments at each level
  let currentLevel = hierarchy.tree;
  
  for (let i = 0; i < pathParts.length; i++) {
    const part = pathParts[i];
    const field = currentLevel.field;
    
    // Assign the field value for this level
    if (field) {
      updates[field] = part;
    }
    
    // Find the matching value node
    const values = currentLevel.values || [];
    const matchingValue = values.find(v => v.value === part);
    
    if (matchingValue && matchingValue.children && matchingValue.children.length > 0) {
      // Get the field name from first child (they all share same field)
      const firstChild = matchingValue.children[0];
      if (typeof firstChild.field === 'string') {
        currentLevel = { field: firstChild.field, values: matchingValue.children };
      } else {
        // Children array contains values, not a new level object
        break;
      }
    } else {
      break;
    }
  }
  
  return updates;
}

// ============================================================================
// Helper function: Update hierarchy.json with Reference movement
// ============================================================================
function updateHierarchyJsonReferences(hierarchyPath, currentPath, targetPath, ref) {
  // Read hierarchy.json
  const hierarchy = JSON.parse(fs.readFileSync(hierarchyPath, 'utf8'));
  const normalizedRef = normalizeRefString(ref);
  
  // Recursive function to find and update nodes
  function updateNode(node, pathToFind, isRemove) {
    if (!node || !node.values) return false;
    
    for (const valueNode of node.values) {
      // Build full path for this node
      let nodePath = valueNode.value;
      
      // Check if we found the target path
      if (pathToFind === nodePath) {
        if (valueNode.references) {
          if (isRemove) {
            // Remove reference
            const idx = valueNode.references.findIndex(r => normalizeRefString(r) === normalizedRef);
            if (idx !== -1) {
              valueNode.references.splice(idx, 1);
              valueNode.recordCount = valueNode.references.length;
              return true;
            }
          } else {
            // Add reference
            if (!valueNode.references.some(r => normalizeRefString(r) === normalizedRef)) {
              valueNode.references.push(ref);
              valueNode.recordCount = valueNode.references.length;
              return true;
            }
          }
        }
      } else if (pathToFind.startsWith(nodePath + '/') && valueNode.children) {
        // Recurse into children
        const childField = valueNode.children[0]?.field;
        if (updateNode({ field: childField, values: valueNode.children }, pathToFind, isRemove)) {
          return true;
        }
      }
    }
    
    return false;
  }
  
  // Remove from current path
  updateNode(hierarchy.tree, currentPath, true);
  
  // Add to target path
  updateNode(hierarchy.tree, targetPath, false);
  
  // Write back to disk
  fs.writeFileSync(hierarchyPath, JSON.stringify(hierarchy, null, 2), 'utf8');
}

// ============================================================================
// Helper function: Update working_data.xml with field changes
// ============================================================================
function updateWorkingDataXmlFields(xmlPath, ref, fieldUpdates) {
  // Read XML with UTF-16 encoding
  const xmlBuffer = fs.readFileSync(xmlPath);
  const xmlData = xmlBuffer.toString('utf16le');
  
  // Parse XML
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    trimValues: true,
    parseAttributeValue: false,
    parseTagValue: false,
  });
  
  const xmlResult = parser.parse(xmlData);
  const phonData = xmlResult.phon_data;
  let dataForms = Array.isArray(phonData.data_form) 
    ? phonData.data_form 
    : [phonData.data_form];
  
  // Find the record to update
  const normalizedRef = normalizeRefString(ref);
  const record = dataForms.find(df => normalizeRefString(df.Reference) === normalizedRef);
  
  if (!record) {
    throw new Error(`Record ${ref} not found in working_data.xml`);
  }
  
  // Update fields
  Object.entries(fieldUpdates).forEach(([field, value]) => {
    record[field] = value;
  });
  
  // Build XML
  const builder = new XMLBuilder({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    format: true,
    indentBy: '  ',
  });
  
  let updatedXml = builder.build(xmlResult);
  
  // Ensure XML declaration with UTF-16
  if (!updatedXml.startsWith('<?xml')) {
    updatedXml = '<?xml version="1.0" encoding="utf-16"?>\n' + updatedXml;
  } else {
    // Replace existing declaration to ensure UTF-16
    updatedXml = updatedXml.replace(
      /<\?xml[^?]*\?>/,
      '<?xml version="1.0" encoding="utf-16"?>'
    );
  }
  
  // Write with UTF-16 encoding
  fs.writeFileSync(xmlPath, updatedXml, 'utf16le');
}

// ============================================================================
// Simplified move-word-to-sub-bundle handler implementation
// ============================================================================
ipcMain.handle('move-word-to-sub-bundle', async (event, { ref, targetSubBundle, returnToOriginal }) => {
  if (bundleType !== 'hierarchical' || !sessionData) {
    return { success: false, error: 'Not a hierarchical bundle' };
  }
  
  try {
    const currentSubBundle = sessionData.currentSubBundle;
    if (!currentSubBundle) {
      return { success: false, error: 'No current sub-bundle' };
    }
    
    if (currentSubBundle === targetSubBundle) {
      return { success: false, error: 'Cannot move to same sub-bundle' };
    }
    
    // Find sub-bundle data and sessions
    const currentSubBundleData = bundleData.subBundles.find(sb => sb.path === currentSubBundle);
    const targetSubBundleData = bundleData.subBundles.find(sb => sb.path === targetSubBundle);
    const currentSession = sessionData.subBundles.find(sb => sb.path === currentSubBundle);
    const targetSession = sessionData.subBundles.find(sb => sb.path === targetSubBundle);
    
    if (!currentSubBundleData || !targetSubBundleData || !currentSession || !targetSession) {
      return { success: false, error: 'Sub-bundle not found' };
    }
    
    // Check if using new structure
    if (bundleData.usesNewStructure) {
      console.log('[move-word] Using new structure - updating hierarchy.json and working_data.xml');
      
      // 1. Update hierarchy.json
      const hierarchyPath = path.join(extractedPath, 'hierarchy.json');
      updateHierarchyJsonReferences(hierarchyPath, currentSubBundle, targetSubBundle, ref);
      
      // Also update in-memory references
      if (currentSubBundleData.references) {
        const idx = currentSubBundleData.references.findIndex(r => normalizeRefString(r) === ref);
        if (idx !== -1) {
          currentSubBundleData.references.splice(idx, 1);
        }
      }
      if (!targetSubBundleData.references) {
        targetSubBundleData.references = [];
      }
      if (!targetSubBundleData.references.some(r => normalizeRefString(r) === ref)) {
        targetSubBundleData.references.push(ref);
      }
      
      // 2. Update working_data.xml with category field changes
      const workingXmlPath = path.join(extractedPath, 'xml', 'working_data.xml');
      const categoryUpdates = getCategoryUpdatesForPath(targetSubBundle, bundleData.hierarchy);
      updateWorkingDataXmlFields(workingXmlPath, ref, categoryUpdates);
      
      console.log(`[move-word] Updated ${ref}: ${Object.entries(categoryUpdates).map(([k,v]) => `${k}=${v}`).join(', ')}`);
      
      // 3. Update session data (NO audio file copying!)
      currentSession.queue = currentSession.queue.filter(r => r !== ref);
      sessionData.queue = sessionData.queue.filter(r => r !== ref);
      
      // Remove from groups if present
      for (const group of currentSession.groups) {
        if (group.members && group.members.includes(ref)) {
          group.members = group.members.filter(m => m !== ref);
          if (group.additionsSinceReview !== undefined) {
            group.additionsSinceReview++;
          }
          break;
        }
      }
      
      for (const group of sessionData.groups) {
        if (group.members && group.members.includes(ref)) {
          group.members = group.members.filter(m => m !== ref);
          if (group.additionsSinceReview !== undefined) {
            group.additionsSinceReview++;
          }
          break;
        }
      }
      
      currentSession.assignedCount = Math.max(0, (currentSession.assignedCount || 0) - 1);
      currentSession.recordCount = (currentSession.recordCount || 0) - 1;
      
      // Add to target sub-bundle
      if (!targetSession.queue.includes(ref)) {
        targetSession.queue.push(ref);
      }
      targetSession.recordCount = (targetSession.recordCount || 0) + 1;
      
      // Track the move
      changeTracker.logSubBundleMove(
        ref,
        currentSubBundle,
        targetSubBundle,
        Object.keys(categoryUpdates).join(', '),
        currentSubBundle,
        targetSubBundle
      );
      
      saveSession();
      
      return {
        success: true,
        session: {
          ...sessionData,
          queue: [...sessionData.queue],
          groups: sessionData.groups.map(g => ({ ...g })),
        },
      };
      
    } else {
      // OLD STRUCTURE: Use existing implementation with audio file copying
      console.log('[move-word] Using old structure - copying files between sub_bundles/');
      // ... existing old implementation code ...
      // (Keep the current implementation for backward compatibility)
    }
    
  } catch (error) {
    console.error('[move-word-to-sub-bundle] Error:', error);
    return { success: false, error: error.message };
  }
});

// ============================================================================
// XML Export handler
// ============================================================================
ipcMain.handle('export-bundle-xml', async (event, options) => {
  try {
    if (!bundleData || bundleType !== 'hierarchical') {
      return { success: false, error: 'No hierarchical bundle loaded' };
    }
    
    if (bundleData.usesNewStructure) {
      // NEW STRUCTURE: Export working_data.xml
      const workingXmlPath = path.join(extractedPath, 'xml', 'working_data.xml');
      
      if (!fs.existsSync(workingXmlPath)) {
        return { success: false, error: 'working_data.xml not found' };
      }
      
      // Choose output path
      const result = await dialog.showSaveDialog(mainWindow, {
        title: 'Export Updated XML',
        defaultPath: 'updated_data.xml',
        filters: [
          { name: 'XML Files', extensions: ['xml'] },
          { name: 'All Files', extensions: ['*'] }
        ]
      });
      
      if (result.canceled) {
        return { success: false, error: 'Export canceled' };
      }
      
      // Copy working_data.xml to export location
      fs.copyFileSync(workingXmlPath, result.filePath);
      
      // Generate change report
      const changes = changeTracker.generateReport();
      const reportPath = result.filePath.replace('.xml', '_changes.json');
      fs.writeFileSync(reportPath, JSON.stringify(changes, null, 2), 'utf8');
      
      return {
        success: true,
        xmlPath: result.filePath,
        reportPath: reportPath,
        recordCount: bundleData.allDataForms ? bundleData.allDataForms.length : 0,
      };
      
    } else {
      // OLD STRUCTURE: Use existing export method
      // ... existing export implementation ...
    }
    
  } catch (error) {
    console.error('[export-bundle-xml] Error:', error);
    return { success: false, error: error.message };
  }
});
