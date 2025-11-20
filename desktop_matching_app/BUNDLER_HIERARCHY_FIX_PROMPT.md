# Prompt for Bundler App: Fix Organizational Group Hierarchy Structure

## Problem
The hierarchy.json file currently stores `organizationalGroup` as metadata on leaf nodes. This causes the desktop matching app to need special workaround logic. Organizational groups should be actual parent nodes in the tree structure.

## Current Structure (Wrong)
```json
{
  "value": "Noun",
  "children": [
    {
      "value": "CVV",
      "organizationalGroup": "1 Syllable",
      "references": ["0015", "0200", ...]
    },
    {
      "value": "CV.CV",
      "organizationalGroup": "2 Syllable Simple",
      "references": ["0021", "0141", ...]
    }
  ]
}
```

## Required Structure (Correct)
```json
{
  "value": "Noun",
  "children": [
    {
      "value": "1 Syllable",
      "label": "1 Syllable",
      "children": [
        {
          "value": "CVV",
          "references": ["0015", "0200", ...]
        }
      ]
    },
    {
      "value": "2 Syllable Simple", 
      "label": "2 Syllable Simple",
      "children": [
        {
          "value": "CV.CV",
          "references": ["0021", "0141", ...]
        }
      ]
    }
  ]
}
```

## Task
Find the bundler app code that generates the hierarchy.json file. Modify the hierarchy building logic to:

1. When processing sub-bundles/leaf nodes, check if they have an `organizationalGroup` field
2. Group all items with the same `organizationalGroup` value under a common parent
3. Insert that organizational group as an intermediate category node in the tree
4. The organizational group node should have:
   - `value`: the organizational group name
   - `label`: the organizational group name  
   - `children`: array of the actual sub-bundle nodes
5. Items without an `organizationalGroup` should remain direct children as before
6. Remove the `organizationalGroup` field from the final leaf nodes (it's now expressed in the structure)

## Expected Behavior
After this change, when the bundler creates a new hierarchical bundle, organizational groups will appear as collapsible parent categories in the desktop matching app's navigation tree, without requiring any workaround code.

## Files to Check
Look for the hierarchy generation code in the bundler app - likely in files that:
- Build the tree structure
- Process category/syllable structure fields
- Write hierarchy.json output
- May reference "organizationalGroup" or syllable grouping logic