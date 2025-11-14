# Reordering Hierarchy Values in Bundler App

## Feature Overview

The bundler app now supports **drag-and-drop reordering** of values within each level of the hierarchy tree, plus **collapse/expand functionality** for better navigation. This allows you to customize the order in which categories appear in your hierarchical bundle and manage complex hierarchies more easily.

## How to Use

### Collapsing and Expanding Items

1. **Collapse Toggle**: Items with children show a **▼** icon on the left
2. **Click to Toggle**: Click the ▼ icon to collapse/expand the children
   - **Expanded (▼)**: Children are visible below the parent
   - **Collapsed (▶)**: Children are hidden to reduce clutter
3. **Visual Feedback**: The collapse icon rotates when toggled

**Benefits**:
- Easier navigation in complex hierarchies
- Reduces visual clutter when reordering
- Lets you focus on specific levels
- No effect on bundle output (purely UI convenience)

### Reordering Items

1. **Navigate to Hierarchy Configuration**: When creating a hierarchical bundle, you'll see the hierarchy tree with all your category values.

2. **Drag and Drop**: 
   - Each value item has a drag handle (⋮⋮) on the left side
   - Click and hold on the drag handle to start dragging
   - Drag the item up or down to your desired position
   - Release to drop the item in its new location

3. **Visual Feedback**:
   - While dragging, the dragged item becomes semi-transparent with a blue dashed border
   - A blue line appears at the drop position when hovering over target locations
   - The drag handle changes appearance on hover (darker background)

### Rules and Constraints

- **Same Level Only**: You can only reorder items within the same parent level
  - Example: You can reorder "Noun", "Verb", "Adjective" (all siblings under Category)
  - You cannot drag "CVCV" (child of Noun) to be a sibling of "Noun"

- **Automatic Persistence**: Your custom order is automatically saved when you drop an item

- **Preserved in Bundle**: The order you set will be maintained in the generated `.tnset` bundle and reflected in the desktop matching app

## Use Cases

### 1. Managing Complex Hierarchies
- **Collapse all but one branch** to focus on reordering specific items
- Example: Collapse "Verb" and "Adjective" while reordering syllable patterns under "Noun"

### 2. Sorting Syllable Patterns
If you want syllable patterns in a specific order (e.g., shortest to longest):
- First, collapse other categories to reduce clutter
- Drag to arrange: CV, VC, CVC, VCV, CVCV, CCVCV, etc.

### 3. Logical Category Order
Arrange word classes in a linguistically logical order:
- Expand all categories to see full structure
- Drag to arrange: Noun → Adjective → Adverb → Verb

### 4. Frequency-Based Ordering
Put most common categories first for easier access:
- Drag most frequently used items to the top
- Collapse rarely used categories

### 5. Custom Workflow
Arrange categories in any order that makes sense for your research workflow

## Technical Details

### Implementation
- **CSS Classes**:
  - `.value-drag-handle`: The drag icon/handle (⋮⋮)
  - `.value-item-dragging`: Applied to item being dragged
  - `.value-item-drag-over`: Applied to drop target on hover
  - `.collapse-toggle`: The collapse/expand icon (▼/▶)
  - `.value-children-container`: Wraps child nodes
  - `.collapsed`: Applied when children are hidden

- **Collapse/Expand**:
  - Icon rotates 90° when collapsed (CSS transform)
  - Children container gets `display: none` when collapsed
  - State is visual-only (doesn't affect export)
  - Independent per value (each can be collapsed separately)

- **Drag Events**:
  - `dragstart`: Initiates drag, stores source path
  - `dragover`: Highlights drop position
  - `drop`: Performs the reorder operation
  - `dragend`: Cleans up visual state

- **Data Structure**: 
  - Uses array index-based paths to identify items
  - Reordering updates the `values` array in the hierarchy tree node
  - Order is preserved in `hierarchyTree` structure and saved to profiles

### Persistence
The custom order is stored in:
1. **Runtime**: The `hierarchyTree` JavaScript object
2. **Settings**: Saved to `bundler-settings.json` 
3. **Profiles**: Included when you save a profile
4. **Bundle Output**: Reflected in `hierarchy.json` within the `.tnset` file

**Note**: Collapse/expand state is NOT persisted (resets when app reopens). This is intentional - it's purely a navigation convenience.

## Troubleshooting

**Issue**: Collapse icon doesn't appear
- **Cause**: The item has no children or is not included
- **Solution**: Only items with children that are included show the collapse toggle

**Issue**: Items snap back to original position
- **Cause**: Trying to drag across different parent levels
- **Solution**: Only reorder siblings (items with the same parent)

**Issue**: Collapsed children interfere with drag and drop
- **Cause**: Trying to drop into a collapsed section
- **Solution**: Expand the target before dragging. Children must be visible for proper drop zones.

**Issue**: Drag handle not visible
- **Cause**: CSS not loaded or browser compatibility
- **Solution**: Refresh the app or check browser console for errors

**Issue**: Order not saved after closing app
- **Cause**: Settings not persisting
- **Solution**: Changes should auto-save. Check permissions for app data directory.

## Future Enhancements

Possible improvements for future versions:
- Remember collapse/expand state in settings (persist across sessions)
- "Collapse all" / "Expand all" buttons for entire tree
- Keyboard shortcuts for collapse/expand (Space key on selected item)
- Keyboard shortcuts for reordering (Alt+Up/Down)
- Bulk reordering operations (alphabetical, numerical sort)
- Undo/redo for reordering operations
- Visual indicators showing custom vs. default order
