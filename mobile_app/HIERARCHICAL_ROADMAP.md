# Mobile App - Hierarchical Bundle Implementation Roadmap

## Status: ⏳ PENDING

**Desktop App**: ✅ Complete (November 12, 2025)  
**Mobile App**: ⏳ Not Started  
**Priority**: Medium (desktop provides full functionality)

---

## Overview

This document outlines the roadmap for implementing hierarchical bundle (.tnset) support in the Flutter mobile app. The desktop implementation is complete and serves as the reference specification.

---

## Implementation Phases

### Phase 1: Core Infrastructure (3-4 days)

#### Task 1: Bundle Type Detection and Loading
**Scope**: Detect .tnset vs .tncmp, extract and parse hierarchical bundles

**Implementation**:
- Update `services/bundle_service.dart`
- Detect file extension and bundle type
- Extract .tnset ZIP archives
- Parse `manifest.json`, `hierarchy.json`, `settings.json`
- Load Contour6 font from fonts/ directory

**Files to Create/Modify**:
- `models/hierarchy_config.dart` - New model for hierarchy structure
- `models/sub_bundle.dart` - New model for sub-bundle data
- `services/bundle_service.dart` - Enhance bundle loading
- `utils/bundle_type_detector.dart` - New utility for type detection

#### Task 2: Sub-Bundle Navigation Screen
**Scope**: Tree-based navigation UI for sub-bundle selection

**Implementation**:
- Create new `screens/sub_bundle_navigation_screen.dart`
- Expandable/collapsible tree widget
- Progress indicators per sub-bundle
- Word count display
- Sub-bundle selection handler

**Widgets to Create**:
- `HierarchyTreeView` - Main tree widget
- `HierarchyNode` - Individual tree node
- `SubBundleProgress` - Progress indicator component

#### Task 3: Session Management for Sub-Bundles
**Scope**: Manage independent sessions per sub-bundle

**Implementation**:
- Update `services/session_service.dart`
- Track current sub-bundle context
- Separate queues and groups per sub-bundle
- Session persistence with sub-bundle state

**Data Structure**:
```dart
class SessionData {
  String bundleId;
  BundleType bundleType; // legacy or hierarchical
  String? currentSubBundle;
  Map<String, SubBundleSession> subBundleSessions;
  // ... existing fields
}

class SubBundleSession {
  String path;
  List<String> queue;
  List<ToneGroup> groups;
  bool reviewed;
  int recordCount;
  int assignedCount;
}
```

---

### Phase 2: Enhanced Display (3-4 days)

#### Task 4: Contour6 Font Loading
**Scope**: Load and use Contour6SILDoulos font for pitch transcription

**Implementation**:
- Add font to `pubspec.yaml`
- Load from bundle's fonts/ directory
- Apply to pitch transcription widgets

**Font Configuration**:
```yaml
# pubspec.yaml
flutter:
  fonts:
    - family: Contour6SILDoulos
      fonts:
        - asset: assets/fonts/Contour6SILDoulos.ttf
```

#### Task 5: Enhanced Tone Group Display
**Scope**: Show pitch, abbreviation, exemplar in group cards

**Implementation**:
- Update `widgets/tone_group_card.dart`
- Add pitch transcription display (Contour6 font)
- Add tone abbreviation display
- Add exemplar word display with reference
- Enhanced layout for metadata

**UI Mockup**:
```
┌─────────────────────────────┐
│ Group 1            ✓        │
│                             │
│ Pitch: ˥˧˩                  │
│ Tone: HML                   │
│ Exemplar: kudi (0003)       │
│                             │
│ [Image]                     │
│                             │
│ 5 words | Tap to expand     │
└─────────────────────────────┘
```

#### Task 6: Reference Number Display
**Scope**: Show reference numbers throughout UI

**Implementation**:
- Read `showReferenceNumbers` from settings
- Display in word cards
- Display in group member lists
- Add settings toggle

#### Task 7: Group Editing Enhancement
**Scope**: Edit modal with pitch, abbreviation, exemplar fields

**Implementation**:
- Update `screens/edit_group_screen.dart`
- Add pitch transcription input (with Contour6 preview)
- Add tone abbreviation input
- Add exemplar word selector (dropdown)
- Add reviewed checkbox

**New Fields in ToneGroup Model**:
```dart
class ToneGroup {
  String id;
  int groupNumber;
  List<String> members;
  String? image;
  
  // New fields:
  String? pitchTranscription;
  String? toneAbbreviation;
  String? exemplarWord;
  String? exemplarWordRef;
  
  bool reviewed;
  int additionsSinceReview;
}
```

---

### Phase 3: Word Management (3-4 days)

#### Task 8: Word Movement Between Sub-Bundles
**Scope**: Move words from one sub-bundle to another

**Implementation**:
- Create `screens/move_word_screen.dart`
- Hierarchy tree picker (reuse from Task 2)
- Target sub-bundle selection
- Update word's category fields
- Transfer between sub-bundle sessions

**User Flow**:
1. Long press on word card → Show options
2. Select "Move to Different Category"
3. Navigate hierarchy tree
4. Select target sub-bundle
5. Confirm move

#### Task 9: Swipe Gesture Enhancement
**Scope**: Adapt swipe gestures for hierarchical context

**Implementation**:
- Update `widgets/word_card.dart`
- First swipe: Remove from group → back to queue
- Second swipe (on queued word): Show move options
- Visual feedback for swipe actions

#### Task 10: Review Status Management
**Scope**: Track and manage review status per sub-bundle

**Implementation**:
- Update `services/session_service.dart`
- "Mark All Reviewed" per sub-bundle
- Auto-unmark on word addition/removal
- Completion detection per sub-bundle
- Visual indicators for reviewed groups

**UI Components**:
- Sub-bundle progress indicator
- Completion banner when sub-bundle finished
- Reviewed status badge on groups

---

### Phase 4: Export & Sync (2-3 days)

#### Task 11: Export Hierarchical Session
**Scope**: Export complete .tnset with all sub-bundles

**Implementation**:
- Create `services/export_service.dart` (or enhance existing)
- Iterate all sub-bundles
- Generate `data_updated.xml` per sub-bundle
- Package with manifest, hierarchy, fonts
- Create export_meta.json

**Export Structure** (same as desktop):
```
export.tnset/
├── manifest.json
├── hierarchy.json
├── settings.json
├── fonts/Contour6SILDoulos.ttf
├── sub_bundles/
│   ├── category1/
│   │   ├── data.xml
│   │   ├── data_updated.xml
│   │   ├── metadata.json
│   │   └── audio/
│   └── category2/
│       └── ...
└── export_meta.json
```

#### Task 12: Export Individual Sub-Bundle
**Scope**: Export single sub-bundle as legacy .zip

**Implementation**:
- Filter records to single sub-bundle
- Generate legacy .tncmp structure
- Include `subBundle` field in meta.json
- Compatible with legacy mobile/desktop apps

#### Task 13: Cloud Sync (Optional)
**Scope**: Sync hierarchical bundles to cloud storage

**Implementation**:
- Update cloud sync logic for hierarchical bundles
- Sync per sub-bundle progress
- Merge conflict resolution
- Bandwidth optimization (only sync changed sub-bundles)

---

### Phase 5: Testing (2-3 days)

#### Task 14: Comprehensive Testing
**Scope**: Test all hierarchical features on iOS and Android

**Test Scenarios**:
1. Load hierarchical bundle
2. Navigate sub-bundle tree
3. Switch between sub-bundles
4. Sort words into groups
5. Add metadata to groups
6. Move words between sub-bundles
7. Mark groups/sub-bundles reviewed
8. Export hierarchical session
9. Export individual sub-bundle
10. Re-import exported bundle
11. Verify session persistence
12. Test with large bundles (500+ records)

#### Task 15: Cross-Platform Compatibility
**Scope**: Ensure compatibility between mobile and desktop

**Test Cases**:
- Load .tnset created by desktop app
- Load .tnset created by bundler app
- Export from mobile → import to desktop
- Export from desktop → import to mobile
- Verify metadata preservation
- Verify audio file handling
- Test different Android/iOS versions

---

## Implementation Timeline

| Phase | Tasks | Estimated Days | Dependencies |
|-------|-------|----------------|--------------|
| Phase 1 | 1-3 | 3-4 days | None |
| Phase 2 | 4-7 | 3-4 days | Phase 1 complete |
| Phase 3 | 8-10 | 3-4 days | Phase 2 complete |
| Phase 4 | 11-13 | 2-3 days | Phase 3 complete |
| Phase 5 | 14-15 | 2-3 days | All phases complete |

**Total Estimated Time**: 3-4 weeks

---

## Technical Considerations

### Flutter-Specific Challenges

1. **Font Rendering**: Ensure Contour6 font renders correctly on both iOS and Android
2. **Tree View**: Implement efficient expandable tree widget (consider packages like `flutter_treeview`)
3. **Memory Management**: Lazy-load sub-bundles to conserve mobile memory
4. **File I/O**: Use Flutter's path_provider for cross-platform file access
5. **ZIP Handling**: Use `archive` package for .tnset extraction
6. **XML Parsing**: Reuse existing XML parsing logic

### Performance Optimizations

1. **Lazy Loading**: Only load current sub-bundle data
2. **Caching**: Cache parsed XML per sub-bundle
3. **Image Optimization**: Compress images before including in bundles
4. **Background Processing**: Use isolates for export operations
5. **Memory Cleanup**: Dispose resources when switching sub-bundles

### UI/UX Considerations

1. **Touch Targets**: Ensure tree nodes are touch-friendly (min 48x48)
2. **Swipe Gestures**: Intuitive swipe for word operations
3. **Progress Visibility**: Clear indicators of progress across all sub-bundles
4. **Offline Support**: Full functionality without network
5. **Large Bundles**: Smooth performance with 50+ sub-bundles

---

## Dependencies

### Flutter Packages Needed

```yaml
dependencies:
  # Existing packages
  provider: ^6.0.0
  sqflite: ^2.0.0
  path_provider: ^2.0.0
  
  # New packages for hierarchical support
  flutter_treeview: ^1.0.7  # Tree view widget
  archive: ^3.3.0            # ZIP handling
  
  # Optional
  flutter_sticky_header: ^0.6.0  # Sticky headers in lists
```

### Assets to Include

```yaml
flutter:
  assets:
    - assets/fonts/Contour6SILDoulos.ttf
  
  fonts:
    - family: Contour6SILDoulos
      fonts:
        - asset: assets/fonts/Contour6SILDoulos.ttf
```

---

## Files to Create/Modify

### New Files (~15 files)

**Models**:
- `lib/models/hierarchy_config.dart`
- `lib/models/sub_bundle.dart`
- `lib/models/sub_bundle_session.dart`

**Screens**:
- `lib/screens/sub_bundle_navigation_screen.dart`
- `lib/screens/move_word_screen.dart`

**Widgets**:
- `lib/widgets/hierarchy_tree_view.dart`
- `lib/widgets/hierarchy_node.dart`
- `lib/widgets/sub_bundle_progress.dart`
- `lib/widgets/enhanced_group_card.dart`

**Services**:
- `lib/services/hierarchical_bundle_service.dart`
- `lib/services/export_service.dart`

**Utils**:
- `lib/utils/bundle_type_detector.dart`
- `lib/utils/font_loader.dart`

**Tests**:
- `test/hierarchical_bundle_test.dart`
- `test/export_service_test.dart`

### Files to Modify (~10 files)

- `lib/services/bundle_service.dart` - Add hierarchical loading
- `lib/services/session_service.dart` - Add sub-bundle sessions
- `lib/models/tone_group.dart` - Add new metadata fields
- `lib/screens/matching_screen.dart` - Conditional UI for bundle type
- `lib/widgets/tone_group_card.dart` - Enhanced display
- `lib/screens/edit_group_screen.dart` - Additional fields
- `lib/widgets/word_card.dart` - Swipe gesture updates
- `pubspec.yaml` - Dependencies and fonts
- `README.md` - Documentation updates

---

## Success Criteria

### Functional Requirements
- [ ] Load hierarchical .tnset bundles successfully
- [ ] Navigate sub-bundle hierarchy smoothly
- [ ] Display enhanced metadata (pitch, abbreviation, exemplar)
- [ ] Move words between sub-bundles
- [ ] Track review status per sub-bundle
- [ ] Export hierarchical sessions
- [ ] Export individual sub-bundles
- [ ] Maintain backward compatibility with legacy bundles

### Performance Requirements
- [ ] Sub-bundle loading < 1 second
- [ ] Tree navigation smooth (60fps)
- [ ] Export time < 5 seconds for typical bundles
- [ ] Memory usage < 200MB for large bundles

### Quality Requirements
- [ ] Zero data loss during operations
- [ ] Graceful error handling
- [ ] Unit test coverage > 80%
- [ ] Cross-platform consistency (iOS/Android)

---

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Font rendering issues | Medium | Test on multiple devices, fallback fonts |
| Memory constraints on old devices | High | Aggressive lazy-loading, memory profiling |
| Complex tree UI performance | Medium | Virtual scrolling, limit tree depth |
| Cross-platform inconsistencies | Medium | Comprehensive testing, platform-specific code |
| Export failures on large bundles | Medium | Streaming export, progress indicators |

---

## Next Steps

1. **Prioritization**: Determine when to begin mobile implementation
2. **Resource Allocation**: Assign developer(s) to mobile work
3. **Prototype**: Build Phase 1 prototype for validation
4. **User Testing**: Test navigation UX with target users
5. **Iterative Development**: Implement phases incrementally with testing

---

## References

**Desktop Implementation**:
- `/desktop_matching_app/IMPLEMENTATION_COMPLETE.md` - Reference implementation
- `/desktop_matching_app/EXPORT_IMPLEMENTATION.md` - Export details
- `/desktop_matching_app/TEST_PLAN.md` - Test scenarios to adapt

**Specifications**:
- `/HIERARCHICAL_FEATURE_SPEC.md` - Original feature specification
- `/bundler_app/TESTING_HIERARCHICAL_BUNDLES.md` - Bundle format details

**Flutter Resources**:
- [Flutter TreeView packages](https://pub.dev/packages?q=treeview)
- [Archive package docs](https://pub.dev/packages/archive)
- [Custom fonts in Flutter](https://docs.flutter.dev/cookbook/design/fonts)

---

**Created**: November 12, 2025  
**Status**: ⏳ Planning Phase  
**Next Review**: When desktop app testing complete  
**Priority**: Medium (desktop provides full functionality)
