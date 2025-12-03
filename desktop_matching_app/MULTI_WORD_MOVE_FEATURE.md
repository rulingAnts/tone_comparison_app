# Multi-Word Move Feature Implementation

## Overview
This document describes the implementation of two new features for the Desktop Matching App:
1. **Multi-word selection and movement** - Select multiple words in the Manage Queue modal and move them together
2. **Create new sub-bundles on the fly** - Create new sub-bundles as the destination when moving words

## Features Implemented

### 1. Multi-Word Selection in Manage Queue Modal

#### UI Changes (`index.html`)
- Added checkboxes to each queue item (only visible for hierarchical bundles)
- Added selection controls bar with:
  - "Select All" button
  - "Deselect All" button  
  - "Move Selected Words" button (shows count of selected words)
- Added CSS for `.queue-item.selected` state
- Multi-select controls automatically hidden for non-hierarchical bundles

#### JavaScript Functions (`renderer.js`)
- `selectedQueueWords` - New Set to track selected word references
- `toggleQueueWordSelection(ref)` - Toggle selection state for a word
- `selectAllQueueWords()` - Select all words in queue
- `deselectAllQueueWords()` - Clear all selections
- `updateSelectedWordCount()` - Update count display and button state
- `initiateMultiWordMove()` - Validate and open move modal with selected words
- Updated `renderQueueList()` to:
  - Show/hide multi-select controls based on bundle type
  - Render checkboxes for each queue item
  - Add selected class to checked items
  - Call `updateSelectedWordCount()` after rendering

#### Validation
- Prevents moving words that are assigned to tone groups
- Shows clear error message listing which words need to be unassigned first
- Requires at least one word to be selected

### 2. Create New Sub-Bundle Option

#### UI Changes (`index.html`)
- Added checkbox "Create New Sub-Bundle" in move word modal
- Added collapsible form for entering new sub-bundle name
- Shows preview of where new sub-bundle will be created
- Updated modal title and button text to reflect single vs multiple words

#### JavaScript Functions (`renderer.js`)
- `toggleCreateNewSubBundle()` - Show/hide new sub-bundle form
  - Displays current path + new name preview
  - Enables/disables confirm button based on name input
  - Disables tree selection when creating new
  - Re-enables tree selection when unchecked
- Updated `openMoveWordModal(refOrRefs, record)` to:
  - Accept either single ref (string) or multiple refs (array)
  - Update modal text based on single vs multiple words
  - Update button text to show word count
  - Reset create new UI state
- Updated `confirmMoveWord()` to:
  - Check if creating new sub-bundle
  - Validate new sub-bundle name if creating
  - Call new backend handler with appropriate parameters
  - Clear selected words after successful multi-word move
  - Show appropriate success message

### 3. Backend Implementation

#### New IPC Handler (`main.js`)
`move-words-to-sub-bundle` - Handles moving one or more words with optional new sub-bundle creation

**Parameters:**
- `refs` - Array of word references (or single ref)
- `targetSubBundle` - Existing sub-bundle path (null if creating new)
- `newSubBundleName` - Name for new sub-bundle (null if using existing)
- `returnToOriginal` - Whether to stay in current sub-bundle

**Process:**
1. Validate hierarchical bundle and current sub-bundle
2. If creating new sub-bundle:
   - Generate new path as child of current
   - Check for duplicates
   - Add to hierarchy.json
   - Create bundleData and sessionData entries
3. For each word being moved:
   - Update hierarchy.json references
   - Update working_data.xml category fields
   - Remove from current sub-bundle queue
   - Remove from any tone groups
   - Add to target sub-bundle queue
   - Log change tracking
4. Update record counts
5. **Check if source sub-bundle is now empty:**
   - If recordCount === 0, automatically remove it
   - Update hierarchy.json to remove empty node
   - Remove from bundleData and sessionData
   - If we were in that sub-bundle, switch to target
6. Save session and return updated state

#### Helper Functions (`main.js`)

**`addNewSubBundleToHierarchy(hierarchy, parentPath, newName)`**
- Navigates hierarchy tree to find parent node
- Adds new value node with name and empty references
- Returns true on success

**`removeEmptySubBundleFromHierarchy(hierarchyPath, subBundlePath)`**
- Reads hierarchy.json
- Navigates to parent of target sub-bundle
- Removes node from parent's values array
- Saves updated hierarchy
- Returns true on success

### 4. Auto-Cleanup of Empty Sub-Bundles

When moving words causes a sub-bundle to become empty (recordCount === 0):
- Automatically removes sub-bundle from hierarchy.json
- Removes from in-memory bundleData
- Removes from sessionData
- If user was in the removed sub-bundle, switches to target sub-bundle
- Prevents orphaned empty sub-bundles in the hierarchy

This behavior mirrors how tone groups are automatically deleted when their last member is removed.

## Usage Workflow

### Moving Multiple Words
1. Open Manage Queue modal
2. Check boxes next to words to move (or use Select All)
3. Click "Move Selected Words (X)" button
4. Select target sub-bundle from tree
5. Click "Move X Words"
6. Words are moved and selection is cleared

### Creating New Sub-Bundle
1. Click "Move to Different Category" for single word, OR select multiple in queue
2. Check "Create New Sub-Bundle"
3. Enter name for new sub-bundle
4. See preview of where it will be created
5. Click "Move Word" or "Move X Words"
6. New sub-bundle is created and word(s) are moved there

### Combined Workflow
- Can create new sub-bundle while moving multiple words
- New sub-bundle becomes child of current sub-bundle
- All selected words moved together to the new location

## Technical Notes

### Data Consistency
- hierarchy.json updated for each word
- working_data.xml category fields updated per word
- Session data (queue, groups) updated atomically
- Change tracking logs all moves

### Empty Sub-Bundle Detection
- Checked after all word moves complete
- Based on recordCount reaching zero
- Removes entire hierarchy node
- Handles cleanup before returning to frontend

### Error Handling
- Validates hierarchical bundle structure
- Checks for duplicate sub-bundle names
- Prevents moving words in tone groups
- Validates all references exist
- Returns clear error messages

## Files Modified

### Frontend
- `desktop_matching_app/public/index.html` - UI for multi-select and create new sub-bundle
- `desktop_matching_app/public/renderer.js` - Selection logic, modal updates, IPC calls

### Backend
- `desktop_matching_app/src/main.js` - New IPC handler, helper functions for hierarchy manipulation

## Testing Checklist

- [ ] Select single word and move to existing sub-bundle
- [ ] Select multiple words and move to existing sub-bundle
- [ ] Create new sub-bundle when moving single word
- [ ] Create new sub-bundle when moving multiple words
- [ ] Verify empty sub-bundle is auto-removed
- [ ] Verify words in tone groups cannot be moved (shows error)
- [ ] Verify duplicate sub-bundle name shows error
- [ ] Verify hierarchy.json updated correctly
- [ ] Verify working_data.xml category fields updated
- [ ] Verify change tracking logs all moves
- [ ] Test with deeply nested hierarchy
- [ ] Test moving all words from a sub-bundle (should remove it)
- [ ] Verify selection UI only shows for hierarchical bundles
- [ ] Test select all / deselect all functionality
- [ ] Verify selected word count updates correctly
