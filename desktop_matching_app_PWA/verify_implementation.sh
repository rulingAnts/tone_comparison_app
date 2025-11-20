#!/bin/bash
# Automated Code Structure Verification
# Validates that all hierarchical bundle features are properly implemented

echo "=================================="
echo "Hierarchical Bundle Implementation"
echo "Code Structure Verification"
echo "=================================="
echo ""

ERRORS=0
WARNINGS=0

# Function to check for pattern in file
check_pattern() {
    local file=$1
    local pattern=$2
    local description=$3
    
    if grep -q "$pattern" "$file" 2>/dev/null; then
        echo "✓ $description"
    else
        echo "✗ MISSING: $description"
        ((ERRORS++))
    fi
}

# Function to check file exists
check_file() {
    local file=$1
    local description=$2
    
    if [ -f "$file" ]; then
        echo "✓ $description"
    else
        echo "✗ MISSING: $description"
        ((ERRORS++))
    fi
}

echo "Task 1: Bundle Type Detection and Loading"
echo "------------------------------------------"
check_pattern "src/main.js" "bundleType.*=.*'hierarchical'" "bundleType variable set"
check_pattern "src/main.js" "extractedPath.*=.*path.join" "Bundle extraction logic"
check_pattern "src/main.js" "manifest.json" "Manifest loading"
check_pattern "src/main.js" "hierarchy.json" "Hierarchy loading"
check_pattern "src/main.js" "sub_bundles" "Sub-bundle directory handling"
echo ""

echo "Task 2: Sub-Bundle Navigation"
echo "------------------------------"
check_pattern "public/index.html" 'id="navigationScreen"' "Navigation screen element"
check_pattern "public/index.html" 'id="hierarchyTree"' "Hierarchy tree element"
check_pattern "public/renderer.js" "renderHierarchyTree" "Hierarchy tree rendering function"
check_pattern "public/renderer.js" "selectSubBundle" "Sub-bundle selection handler"
check_pattern "src/main.js" "ipcMain.handle('select-sub-bundle'" "Sub-bundle selection IPC"
echo ""

echo "Task 3: Enhanced Tone Group Display"
echo "------------------------------------"
check_pattern "public/index.html" "pitch-transcription" "Pitch transcription element"
check_pattern "public/index.html" "tone-abbreviation" "Tone abbreviation element"
check_pattern "public/index.html" "exemplar-word" "Exemplar word element"
check_pattern "public/renderer.js" "renderGroups" "Group rendering function"
check_file "public/fonts/Contour6SILDoulos.ttf" "Contour6 font file"
echo ""

echo "Task 4: Tone Group Editing"
echo "--------------------------"
check_pattern "public/index.html" 'id="editGroupModal"' "Edit group modal"
check_pattern "public/index.html" "pitchTranscriptionInput" "Pitch input field"
check_pattern "public/index.html" "toneAbbreviationInput" "Abbreviation input field"
check_pattern "public/index.html" "exemplarWordSelect" "Exemplar dropdown"
check_pattern "public/renderer.js" "saveGroupEdits" "Save edits function"
check_pattern "src/main.js" "ipcMain.handle('update-group'" "Update group IPC"
echo ""

echo "Task 5: Reference Number Display"
echo "---------------------------------"
check_pattern "public/renderer.js" "normalizeRefString\\|Reference" "Reference handling"
check_pattern "public/index.html" "ref-display\\|reference-number" "Reference display elements"
check_pattern "public/renderer.js" "showReferences\\|toggleReferences" "Reference toggle function"
echo ""

echo "Task 6: Word Movement"
echo "---------------------"
check_pattern "public/index.html" 'id="moveWordModal"' "Move word modal"
check_pattern "public/renderer.js" "openMoveWordModal" "Open move modal function"
check_pattern "public/renderer.js" "confirmMoveWord" "Confirm move function"
check_pattern "src/main.js" "ipcMain.handle('move-word-to-sub-bundle'" "Move word IPC"
check_pattern "public/index.html" "move-button\\|↗" "Move button UI"
echo ""

echo "Task 7: Review Status Management"
echo "---------------------------------"
check_pattern "public/index.html" 'id="markAllReviewedBtn"' "Mark All Reviewed button"
check_pattern "public/index.html" 'id="completionMessage"' "Completion message element"
check_pattern "public/renderer.js" "markAllGroupsReviewed" "Mark all reviewed function"
check_pattern "public/renderer.js" "checkCompletion" "Check completion function"
check_pattern "public/renderer.js" "updateReviewStatusDisplay" "Update review status function"
echo ""

echo "Task 8: Export Hierarchical Session"
echo "------------------------------------"
check_pattern "src/main.js" "exportHierarchicalBundle" "Export hierarchical function"
check_pattern "src/main.js" "buildSubBundleDataXml" "Build sub-bundle XML function"
check_pattern "src/main.js" "export-bundle.*hierarchical\\|bundleType.*===.*'hierarchical'" "Export routing"
check_pattern "public/renderer.js" "exportHierarchicalBundle" "Export hierarchical UI function"
check_pattern "public/index.html" 'id="hierarchicalExportSection"' "Hierarchical export section"
check_pattern "public/index.html" "tm_exportCompleteSession" "Export complete session button"
echo ""

echo "Task 9: Export Individual Sub-Bundle"
echo "-------------------------------------"
check_pattern "src/main.js" "ipcMain.handle('export-sub-bundle'" "Export sub-bundle IPC"
check_pattern "src/main.js" "export-sub-bundle.*subBundlePath" "Sub-bundle path parameter"
check_pattern "public/renderer.js" "exportCurrentSubBundle" "Export sub-bundle UI function"
check_pattern "public/index.html" "tm_exportSubBundle" "Export sub-bundle button"
echo ""

echo "Localization"
echo "------------"
check_pattern "public/locales/en.json" "tm_exportCompleteSession" "Complete session localization"
check_pattern "public/locales/en.json" "tm_exportSubBundle" "Sub-bundle localization"
check_pattern "public/locales/en.json" "tm_selectSubBundle" "Select sub-bundle localization"
echo ""

echo "=================================="
echo "Verification Complete"
echo "=================================="
echo ""
echo "Summary:"
echo "  Errors: $ERRORS"
echo "  Warnings: $WARNINGS"
echo ""

if [ $ERRORS -eq 0 ]; then
    echo "✓ All code structures verified successfully!"
    echo "✓ Ready for manual testing"
    exit 0
else
    echo "✗ Some code structures are missing or incorrect"
    echo "  Please review the implementation"
    exit 1
fi
