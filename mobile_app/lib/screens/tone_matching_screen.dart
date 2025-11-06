import 'package:flutter/material.dart';
import 'dart:io';
import 'package:provider/provider.dart';
import 'package:image_picker/image_picker.dart';
import 'package:file_selector/file_selector.dart';
import 'package:path/path.dart' as p;
import 'package:flutter_file_dialog/flutter_file_dialog.dart';
import '../services/app_state.dart';
import '../models/tone_group.dart';
import 'package:tone_comparison_app/generated/app_localizations.dart';

/// Main tone matching screen
class ToneMatchingScreen extends StatefulWidget {
  const ToneMatchingScreen({super.key});

  @override
  State<ToneMatchingScreen> createState() => _ToneMatchingScreenState();
}

class _ToneMatchingScreenState extends State<ToneMatchingScreen> {
  final _spellingController = TextEditingController();
  final _spellingFocusNode = FocusNode();
  final ImagePicker _imagePicker = ImagePicker();

  final PageController _pageController = PageController();
  int _currentGroupPage = 0;

  String? _lastWordRef;
  bool _spellingEntered = false;
  bool _editingSpelling = false;
  bool _reviewMode = false;
  bool _reassignTipDismissed = false;

  @override
  void dispose() {
    _spellingController.dispose();
    _spellingFocusNode.dispose();
    _pageController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.tm_title),
        actions: [
          // Reset sorting menu
          Consumer<AppState>(
            builder: (context, appState, _) => PopupMenuButton<String>(
              onSelected: (value) async {
                if (value == 'reset') {
                  await Provider.of<AppState>(
                    context,
                    listen: false,
                  ).resetSorting();
                  if (!context.mounted) return;
                  setState(() {
                    _spellingController.clear();
                    _spellingEntered = false;
                    _editingSpelling = false;
                    _lastWordRef = null;
                    _reassignTipDismissed = false;
                    _reviewMode = false;
                    _currentGroupPage = 0;
                  });
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text(l10n.tm_reset_snackbar)),
                  );
                }
              },
              itemBuilder: (context) => [
                PopupMenuItem<String>(
                  value: 'reset',
                  child: Text(l10n.tm_menu_resetSortingLabel),
                ),
              ],
            ),
          ),
        ],
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(2),
          child: Consumer<AppState>(
            builder: (context, appState, _) {
              final total = appState.totalCount;
              final completed = total - appState.remainingUnsortedCount;
              final progress = total == 0 ? 0.0 : completed / total;
              return SizedBox(
                height: 2,
                child: LinearProgressIndicator(value: progress.clamp(0.0, 1.0)),
              );
            },
          ),
        ),
      ),
      body: GestureDetector(
        behavior: HitTestBehavior.translucent,
        onTap: () => FocusScope.of(context).unfocus(),
        child: Consumer<AppState>(
          builder: (context, appState, child) {
            if (appState.isComplete) {
              if (_reviewMode) {
                return _buildToneGroupsPager(appState);
              }
              return _buildCompleteView(appState);
            }

            final currentWord = appState.currentWord;
            if (currentWord == null) {
              return Center(child: Text(l10n.tm_noWords));
            }

            // Reset spelling field when the current word changes
            if (_lastWordRef != currentWord.reference) {
              _lastWordRef = currentWord.reference;
              final existing = currentWord.userSpelling ?? '';
              _spellingController.text = existing;
              _spellingEntered = existing.isNotEmpty;
              _editingSpelling =
                  false; // reset edit state when the word changes
            }

            final requireSpelling =
                appState.settings?.requireUserSpelling ?? false;
            final hasExistingGroup = currentWord.toneGroup != null;

            return Column(
              children: [
                // Word info and audio
                Padding(
                  padding: const EdgeInsets.all(16.0),
                  child: Column(
                    children: [
                      Text(
                        l10n.tm_completedOfTotal(
                          appState.totalCount - appState.remainingUnsortedCount,
                          appState.totalCount,
                        ),
                        style: Theme.of(context).textTheme.titleMedium,
                      ),
                      const SizedBox(height: 8),
                      // Show written form (phonetic, etc.) if enabled
                      if (appState.settings?.showWrittenForm ?? false) ...[
                        Text(
                          currentWord.getDisplayText(
                            appState.settings!.writtenFormElements,
                          ),
                          style: Theme.of(context).textTheme.headlineMedium,
                        ),
                        const SizedBox(height: 6),
                      ],
                      // Show gloss independently of written form visibility
                      if ((appState.settings?.showGloss ?? false) &&
                          (appState.settings?.glossElement != null))
                        Builder(
                          builder: (context) {
                            final glossKey = appState.settings!.glossElement!;
                            final gloss = currentWord.fields[glossKey];
                            if (gloss == null || gloss.isEmpty) {
                              return const SizedBox.shrink();
                            }
                            return Text(
                              gloss,
                              style: Theme.of(context).textTheme.titleMedium
                                  ?.copyWith(color: Colors.grey[600]),
                            );
                          },
                        ),
                      const SizedBox(height: 16),
                      // Variant selector + Play button row
                      Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          // Dropdown to select audio variant
                          Builder(
                            builder: (context) {
                              final variants =
                                  appState.settings?.audioFileVariants ??
                                  const [];
                              if (variants.isEmpty) {
                                return const SizedBox.shrink();
                              }
                              final selected =
                                  appState.selectedAudioVariantIndex;
                              return Container(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 12,
                                ),
                                decoration: BoxDecoration(
                                  border: Border.all(
                                    color: Colors.grey.shade300,
                                  ),
                                  borderRadius: BorderRadius.circular(8),
                                  color: Theme.of(context).colorScheme.surface,
                                ),
                                child: DropdownButton<int>(
                                  value: selected.clamp(0, variants.length - 1),
                                  underline: const SizedBox.shrink(),
                                  items: [
                                    for (int i = 0; i < variants.length; i++)
                                      DropdownMenuItem<int>(
                                        value: i,
                                        child: Text(
                                          (variants[i].description.isNotEmpty)
                                              ? variants[i].description
                                              : 'Default',
                                        ),
                                      ),
                                  ],
                                  onChanged: (val) {
                                    if (val != null) {
                                      appState.setSelectedAudioVariantIndex(
                                        val,
                                      );
                                    }
                                  },
                                ),
                              );
                            },
                          ),
                          const SizedBox(width: 16),
                          IconButton(
                            icon: const Icon(Icons.play_circle_filled),
                            iconSize: 64,
                            color: Theme.of(context).primaryColor,
                            onPressed: () async {
                              try {
                                await appState.playWord(currentWord);
                              } catch (e) {
                                if (!context.mounted) return;
                                ScaffoldMessenger.of(context).showSnackBar(
                                  SnackBar(content: Text(l10n.tm_audioError)),
                                );
                              }
                            },
                          ),
                        ],
                      ),

                      // User spelling input if required
                      if (requireSpelling && !hasExistingGroup) ...[
                        const SizedBox(height: 16),
                        if (!_spellingEntered || _editingSpelling)
                          TextField(
                            focusNode: _spellingFocusNode,
                            controller: _spellingController,
                            decoration: InputDecoration(
                              labelText: l10n.tm_enterSpelling,
                              border: const OutlineInputBorder(),
                              suffixIcon: IconButton(
                                icon: const Icon(Icons.check),
                                onPressed: () {
                                  final value = _spellingController.text.trim();
                                  if (value.isNotEmpty) {
                                    appState.updateUserSpelling(value);
                                    FocusScope.of(context).unfocus();
                                    setState(() {
                                      _spellingEntered = true;
                                      _editingSpelling = false;
                                    });
                                  }
                                },
                              ),
                            ),
                            onSubmitted: (value) {
                              final v = value.trim();
                              if (v.isNotEmpty) {
                                appState.updateUserSpelling(v);
                                FocusScope.of(context).unfocus();
                                setState(() {
                                  _spellingEntered = true;
                                  _editingSpelling = false;
                                });
                              }
                            },
                          )
                        else
                          Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 12,
                              vertical: 10,
                            ),
                            decoration: BoxDecoration(
                              border: Border.all(color: Colors.grey.shade300),
                              borderRadius: BorderRadius.circular(8),
                              color: Theme.of(
                                context,
                              ).colorScheme.surfaceContainerLowest,
                            ),
                            child: Row(
                              children: [
                                Expanded(
                                  child: Text(
                                    currentWord.userSpelling ?? '',
                                    style: Theme.of(
                                      context,
                                    ).textTheme.titleMedium,
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                ),
                                IconButton(
                                  tooltip: 'Edit spelling',
                                  icon: const Icon(Icons.edit),
                                  onPressed: () {
                                    setState(() {
                                      _editingSpelling = true;
                                    });
                                    // slight delay to ensure rebuild then focus
                                    Future.delayed(
                                      const Duration(milliseconds: 50),
                                      () {
                                        if (!mounted) return;
                                        _spellingFocusNode.requestFocus();
                                      },
                                    );
                                  },
                                ),
                              ],
                            ),
                          ),
                      ],
                    ],
                  ),
                ),

                // Tone groups list is always visible so users can reassign anytime
                Expanded(child: _buildToneGroupsPager(appState)),
              ],
            );
          },
        ),
      ),
    );
  }

  Widget _buildToneGroupsPager(AppState appState) {
    final groups = appState.toneGroups;
    final l10n = AppLocalizations.of(context);
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                l10n.tm_selectGroup,
                style: Theme.of(context).textTheme.titleMedium,
              ),
              Text('${_currentGroupPage + 1}/${groups.length + 1}'),
            ],
          ),
        ),
        Expanded(
          child: PageView.builder(
            controller: _pageController,
            onPageChanged: (i) => setState(() => _currentGroupPage = i),
            itemCount: groups.length + 1, // plus create new group page
            itemBuilder: (context, index) {
              if (index == groups.length) {
                // Create New Group page
                return _buildCreateGroupPage(appState);
              }
              final group = groups[index];
              return _buildGroupPage(appState, group);
            },
          ),
        ),
      ],
    );
  }

  Widget _buildGroupPage(AppState appState, ToneGroup group) {
    final theme = Theme.of(context);
    final imageHeight = MediaQuery.of(context).size.height * 0.3; // big image
    // Determine if the user can add the current word now
    final requireSpelling = appState.settings?.requireUserSpelling ?? false;
    final currentWord = appState.currentWord;
    final hasExistingGroup = currentWord?.toneGroup != null;
    final canAddNow = !requireSpelling || _spellingEntered || hasExistingGroup;
    return SingleChildScrollView(
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Card(
            clipBehavior: Clip.antiAlias,
            elevation: 3,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                // Large image with edit/remove overlay
                SizedBox(
                  height: imageHeight.clamp(200.0, 420.0),
                  child: Stack(
                    children: [
                      Positioned.fill(
                        child:
                            group.imagePath != null &&
                                group.imagePath!.isNotEmpty
                            ? Image.file(
                                File(group.imagePath!),
                                key: ValueKey(group.imagePath),
                                fit: BoxFit.cover,
                                errorBuilder: (context, error, stackTrace) {
                                  return Container(
                                    color: theme
                                        .colorScheme
                                        .surfaceContainerHighest,
                                    child: const Center(
                                      child: Icon(
                                        Icons.image_not_supported,
                                        size: 72,
                                      ),
                                    ),
                                  );
                                },
                              )
                            : Container(
                                color:
                                    theme.colorScheme.surfaceContainerHighest,
                                child: const Center(
                                  child: Icon(
                                    Icons.image_not_supported,
                                    size: 72,
                                  ),
                                ),
                              ),
                      ),
                      Positioned(
                        right: 8,
                        top: 8,
                        child: Row(
                          children: [
                            // Change image
                            Material(
                              color: Colors.black45,
                              shape: const CircleBorder(),
                              child: IconButton(
                                icon: const Icon(
                                  Icons.edit,
                                  color: Colors.white,
                                ),
                                tooltip: 'Change picture',
                                onPressed: () =>
                                    _changeGroupImage(appState, group),
                              ),
                            ),
                            const SizedBox(width: 8),
                            // Remove image
                            Material(
                              color: Colors.black45,
                              shape: const CircleBorder(),
                              child: IconButton(
                                icon: const Icon(
                                  Icons.delete_outline,
                                  color: Colors.white,
                                ),
                                tooltip: 'Remove picture',
                                onPressed:
                                    group.imagePath == null ||
                                        group.imagePath!.isEmpty
                                    ? null
                                    : () => _confirmRemoveGroupImage(
                                        appState,
                                        group,
                                      ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.all(16.0),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        AppLocalizations.of(
                          context,
                        ).tm_groupNumber(group.groupNumber),
                        style: theme.textTheme.titleLarge,
                      ),
                      const SizedBox(height: 8),
                      ElevatedButton.icon(
                        onPressed: canAddNow
                            ? () => _selectToneGroup(appState, group)
                            : null,
                        icon: const Icon(Icons.add_circle_outline),
                        label: Text(AppLocalizations.of(context).tm_addWord),
                        style: ElevatedButton.styleFrom(
                          padding: const EdgeInsets.symmetric(vertical: 12),
                        ),
                      ),
                      if (!canAddNow &&
                          requireSpelling &&
                          !hasExistingGroup) ...[
                        const SizedBox(height: 6),
                        Text(
                          AppLocalizations.of(context).tm_addWord_disabled_hint,
                          style: Theme.of(context).textTheme.bodySmall
                              ?.copyWith(color: Colors.grey[600]),
                        ),
                      ],
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          Text(
            AppLocalizations.of(context).tm_groupMembers,
            style: theme.textTheme.titleMedium,
          ),
          const SizedBox(height: 8),
          if (!_reassignTipDismissed)
            Card(
              elevation: 0,
              color: theme.colorScheme.surfaceContainerHighest,
              child: ListTile(
                leading: const Icon(Icons.swipe),
                title: Text(AppLocalizations.of(context).tm_swipeHint),
                trailing: IconButton(
                  icon: const Icon(Icons.close),
                  onPressed: () => setState(() => _reassignTipDismissed = true),
                ),
              ),
            ),
          if (!_reassignTipDismissed) const SizedBox(height: 8),
          // Members list with play buttons, two-line priority: gloss > spelling > written
          ...group.members.map(
            (word) => Dismissible(
              key: ValueKey('member-${word.reference}'),
              background: Container(
                color: Colors.blueAccent.withValues(alpha: 0.2),
                alignment: Alignment.centerLeft,
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: const Icon(Icons.open_in_new),
              ),
              secondaryBackground: Container(
                color: Colors.blueAccent.withValues(alpha: 0.2),
                alignment: Alignment.centerRight,
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: const Icon(Icons.open_in_new),
              ),
              onDismissed: (direction) {
                // Move this word out of the group and make it current to reassign
                Provider.of<AppState>(
                  context,
                  listen: false,
                ).moveWordForReassignment(word);
                if (!mounted) return;
                final l10n = AppLocalizations.of(context);
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(
                    content: Text(l10n.tm_moved_prompt),
                    duration: const Duration(seconds: 2),
                  ),
                );
              },
              child: ListTile(
                dense: true,
                title: () {
                  final s = appState.settings!;
                  final parts = <String>[];
                  if (s.showGloss && s.glossElement != null) {
                    final g = word.fields[s.glossElement!] ?? '';
                    if (g.isNotEmpty) parts.add(g);
                  }
                  if (s.requireUserSpelling) {
                    final u = word.userSpelling ?? '';
                    if (u.isNotEmpty) parts.add(u);
                  }
                  if (s.showWrittenForm) {
                    final wf = word.getDisplayText(s.writtenFormElements);
                    if (wf.isNotEmpty) parts.add(wf);
                  }
                  final titleText = parts.isNotEmpty ? parts[0] : '';
                  return Text(
                    titleText,
                    overflow: TextOverflow.ellipsis,
                    maxLines: 1,
                  );
                }(),
                subtitle: () {
                  final s = appState.settings!;
                  final parts = <String>[];
                  if (s.showGloss && s.glossElement != null) {
                    final g = word.fields[s.glossElement!] ?? '';
                    if (g.isNotEmpty) parts.add(g);
                  }
                  if (s.requireUserSpelling) {
                    final u = word.userSpelling ?? '';
                    if (u.isNotEmpty) parts.add(u);
                  }
                  if (s.showWrittenForm) {
                    final wf = word.getDisplayText(s.writtenFormElements);
                    if (wf.isNotEmpty) parts.add(wf);
                  }
                  if (parts.length >= 2) {
                    return Text(
                      parts[1],
                      overflow: TextOverflow.ellipsis,
                      maxLines: 1,
                    );
                  }
                  return null;
                }(),
                trailing: IconButton(
                  icon: const Icon(Icons.play_arrow),
                  onPressed: () async {
                    try {
                      await appState.playWord(word);
                    } catch (e) {
                      if (!mounted) return;
                      final l10n = AppLocalizations.of(context);
                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(content: Text(l10n.tm_audioError)),
                      );
                    }
                  },
                ),
              ),
            ),
          ),
          const SizedBox(height: 24),
        ],
      ),
    );
  }

  Widget _buildCreateGroupPage(AppState appState) {
    final theme = Theme.of(context);
    final l10n = AppLocalizations.of(context);
    return Center(
      child: Card(
        margin: const EdgeInsets.all(24),
        child: InkWell(
          onTap: () => _createNewToneGroup(appState),
          child: Padding(
            padding: const EdgeInsets.all(32.0),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(
                  Icons.add_photo_alternate_outlined,
                  size: 96,
                  color: theme.colorScheme.primary,
                ),
                const SizedBox(height: 12),
                Text(
                  l10n.tm_createGroupTitle,
                  style: theme.textTheme.titleLarge,
                ),
                const SizedBox(height: 8),
                Text(l10n.tm_createGroupSubtitle),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildCompleteView(AppState appState) {
    final l10n = AppLocalizations.of(context);
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Icon(Icons.check_circle, size: 128, color: Colors.green),
          const SizedBox(height: 32),
          Text(
            l10n.tm_allMatched,
            style: Theme.of(context).textTheme.headlineMedium,
          ),
          const SizedBox(height: 16),
          Text(
            l10n.tm_groupsCreated(appState.toneGroups.length),
            style: Theme.of(context).textTheme.titleMedium,
          ),
          const SizedBox(height: 32),
          ElevatedButton.icon(
            onPressed: _shareResults,
            icon: const Icon(Icons.ios_share),
            label: Text(l10n.tm_share),
          ),
        ],
      ),
    );
  }

  Future<void> _createNewToneGroup(AppState appState) async {
    // Desktop (Windows/macOS/Linux): choose an image file via file_selector
    if (Platform.isWindows || Platform.isLinux || Platform.isMacOS) {
      final previousLen = appState.toneGroups.length;
      final XFile? file = await openFile(
        acceptedTypeGroups: const [
          XTypeGroup(
            label: 'Images',
            extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp'],
          ),
        ],
      );
      if (file != null) {
        appState.createNewToneGroup(file.path);
        // Clear spelling for the next word to avoid carryover
        if (mounted) {
          setState(() {
            _spellingController.clear();
            _spellingEntered = false;
          });
        }
        // Jump to the newly created group's page and refresh UI
        final newIndex = previousLen; // new group appended at end
        if (mounted) {
          setState(() => _currentGroupPage = newIndex);
          await _pageController.animateToPage(
            newIndex,
            duration: const Duration(milliseconds: 250),
            curve: Curves.easeOut,
          );
        }
        // After creating a group, the current word was removed from the queue in AppState;
        // the next head becomes current automatically.
      }
      return;
    }

    // Mobile: let the user choose Camera or Gallery
    final String? action = await showModalBottomSheet<String>(
      context: context,
      builder: (ctx) => SafeArea(
        child: Wrap(
          children: [
            ListTile(
              leading: const Icon(Icons.camera_alt),
              title: Text(AppLocalizations.of(ctx).tm_takePhoto),
              onTap: () => Navigator.of(ctx).pop('camera'),
            ),
            ListTile(
              leading: const Icon(Icons.photo_library),
              title: Text(AppLocalizations.of(ctx).tm_chooseFromGallery),
              onTap: () => Navigator.of(ctx).pop('gallery'),
            ),
            const Divider(height: 1),
            ListTile(
              leading: const Icon(Icons.close),
              title: Text(AppLocalizations.of(ctx).common_cancel),
              onTap: () => Navigator.of(ctx).pop(null),
            ),
          ],
        ),
      ),
    );

    if (!mounted || action == null) return;

    // Camera or gallery
    final previousLen = appState.toneGroups.length;
    final source = action == 'camera'
        ? ImageSource.camera
        : ImageSource.gallery;
    final XFile? image = await _imagePicker.pickImage(
      source: source,
      preferredCameraDevice: CameraDevice.rear,
    );

    if (image != null) {
      appState.createNewToneGroup(image.path);
      // Clear spelling for the next word to avoid carryover
      if (mounted) {
        setState(() {
          _spellingController.clear();
          _spellingEntered = false;
        });
      }
      // Jump to the newly created group's page and refresh UI
      final newIndex = previousLen; // appended
      if (mounted) {
        setState(() => _currentGroupPage = newIndex);
        await _pageController.animateToPage(
          newIndex,
          duration: const Duration(milliseconds: 250),
          curve: Curves.easeOut,
        );
      }
      // After creating a group, the current word was removed from the queue in AppState;
      // the next head becomes current automatically.
    }
  }

  void _selectToneGroup(AppState appState, ToneGroup group) async {
    appState.addToToneGroup(group);
    // Clear spelling for the next word to avoid carryover
    if (mounted) {
      setState(() {
        _spellingController.clear();
        _spellingEntered = false;
      });
    }
    // If the group reached the review threshold, prompt the user to review.
    if (group.requiresReview) {
      await showDialog<bool>(
        context: context,
        builder: (ctx) {
          final l10n = AppLocalizations.of(ctx);
          return AlertDialog(
            title: Text(l10n.tm_reviewPrompt_title),
            content: Text(
              l10n.tm_reviewPrompt_message(
                AppState.reviewThreshold,
                group.groupNumber,
              ),
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.of(ctx).pop(false),
                child: Text(l10n.tm_reviewPrompt_later),
              ),
              ElevatedButton(
                onPressed: () => Navigator.of(ctx).pop(true),
                child: Text(l10n.tm_reviewPrompt_now),
              ),
            ],
          );
        },
      );
      // No separate review interface: keep the user in the sorting view.
    }
  }

  Future<void> _shareResults() async {
    final appState = Provider.of<AppState>(context, listen: false);

    try {
      // Suggest reviewing all groups before sharing
      final reviewAll = await showDialog<bool>(
        context: context,
        builder: (ctx) {
          final l10n = AppLocalizations.of(ctx);
          return AlertDialog(
            title: Text(l10n.share_reviewAll_title),
            content: Text(l10n.share_reviewAll_message),
            actions: [
              TextButton(
                onPressed: () => Navigator.of(ctx).pop(false),
                child: Text(l10n.share_reviewAll_skip),
              ),
              ElevatedButton(
                onPressed: () => Navigator.of(ctx).pop(true),
                child: Text(l10n.share_reviewAll_reviewAll),
              ),
            ],
          );
        },
      );

      if (!mounted) return;

      if (reviewAll == true) {
        // Switch to pager UI for review
        if (appState.isComplete) {
          setState(() => _reviewMode = true);
        }
        return;
      }

      // Choose share option
      final choice = await showModalBottomSheet<String>(
        context: context,
        builder: (ctx) {
          final l10n = AppLocalizations.of(ctx);
          return SafeArea(
            child: Wrap(
              children: [
                ListTile(
                  leading: const Icon(Icons.ios_share),
                  title: Text(l10n.share_option_shareApps),
                  onTap: () => Navigator.of(ctx).pop('share'),
                ),
                if (Platform.isAndroid)
                  ListTile(
                    leading: const Icon(Icons.cloud_upload),
                    title: Text(l10n.share_option_saveDrive),
                    onTap: () => Navigator.of(ctx).pop('saveDrive'),
                  ),
                ListTile(
                  leading: const Icon(Icons.save_alt),
                  title: Text(l10n.share_option_saveFiles),
                  onTap: () => Navigator.of(ctx).pop('save'),
                ),
                const Divider(height: 1),
                ListTile(
                  leading: const Icon(Icons.close),
                  title: Text(l10n.common_cancel),
                  onTap: () => Navigator.of(ctx).pop(null),
                ),
              ],
            ),
          );
        },
      );

      if (!mounted || choice == null) return;

      if (choice == 'share') {
        await appState.shareResults();
      } else if (choice == 'save' || choice == 'saveDrive') {
        try {
          final zipPath = await appState.prepareShareZip();
          if (Platform.isAndroid || Platform.isIOS) {
            // Use native Create Document / Files save dialog with bytes for reliability
            final data = await File(zipPath).readAsBytes();
            final params = SaveFileDialogParams(
              data: data,
              fileName: appState.suggestedExportFileName,
            );
            final savedPath = await FlutterFileDialog.saveFile(params: params);
            if (!mounted) return;
            final l10n = AppLocalizations.of(context);
            if (savedPath != null && savedPath.isNotEmpty) {
              ScaffoldMessenger.of(
                context,
              ).showSnackBar(SnackBar(content: Text(l10n.share_saved_ok)));
            } else {
              // User canceled or picker unavailable; gentle info on Android
              if (Platform.isAndroid) {
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(
                    content: Text(l10n.share_saved_failed),
                    backgroundColor: Colors.red,
                  ),
                );
                await showDialog<void>(
                  context: context,
                  builder: (ctx) => AlertDialog(
                    title: Text(l10n.share_option_saveDrive),
                    content: Text(l10n.share_android_picker_missing_message),
                    actions: [
                      TextButton(
                        onPressed: () => Navigator.of(ctx).pop(),
                        child: Text(l10n.common_cancel),
                      ),
                    ],
                  ),
                );
              }
            }
          } else {
            // Desktop fallback: choose a folder and copy the file
            final dirPath = await getDirectoryPath();
            if (dirPath != null) {
              final destPath = p.join(
                dirPath,
                appState.suggestedExportFileName,
              );
              await File(zipPath).copy(destPath);
              if (!mounted) return;
              final l10n = AppLocalizations.of(context);
              ScaffoldMessenger.of(
                context,
              ).showSnackBar(SnackBar(content: Text(l10n.share_saved_ok)));
            }
          }
        } catch (e) {
          if (!mounted) return;
          final l10n = AppLocalizations.of(context);
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(l10n.share_saved_failed),
              backgroundColor: Colors.red,
            ),
          );
          if (Platform.isAndroid) {
            await showDialog<void>(
              context: context,
              builder: (ctx) => AlertDialog(
                title: Text(AppLocalizations.of(ctx).share_option_saveDrive),
                content: Text(
                  AppLocalizations.of(ctx).share_android_save_failed_message,
                ),
                actions: [
                  TextButton(
                    onPressed: () => Navigator.of(ctx).pop(),
                    child: Text(AppLocalizations.of(ctx).common_cancel),
                  ),
                ],
              ),
            );
          }
        }
      }
    } catch (e) {
      if (!mounted) return;
      final l10n = AppLocalizations.of(context);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(l10n.export_failed),
          backgroundColor: Colors.red,
        ),
      );
    }
  }

  Future<void> _changeGroupImage(AppState appState, ToneGroup group) async {
    // Desktop platforms: file picker
    if (Platform.isWindows || Platform.isLinux || Platform.isMacOS) {
      final XFile? file = await openFile(
        acceptedTypeGroups: const [
          XTypeGroup(
            label: 'Images',
            extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp'],
          ),
        ],
      );
      if (file != null) {
        appState.updateToneGroupImage(group, file.path);
      }
      return;
    }

    // Mobile: choose camera or gallery
    final String? action = await showModalBottomSheet<String>(
      context: context,
      builder: (ctx) => SafeArea(
        child: Wrap(
          children: [
            ListTile(
              leading: const Icon(Icons.camera_alt),
              title: Text(AppLocalizations.of(ctx).tm_takePhoto),
              onTap: () => Navigator.of(ctx).pop('camera'),
            ),
            ListTile(
              leading: const Icon(Icons.photo_library),
              title: Text(AppLocalizations.of(ctx).tm_chooseFromGallery),
              onTap: () => Navigator.of(ctx).pop('gallery'),
            ),
            const Divider(height: 1),
            ListTile(
              leading: const Icon(Icons.close),
              title: Text(AppLocalizations.of(ctx).common_cancel),
              onTap: () => Navigator.of(ctx).pop(null),
            ),
          ],
        ),
      ),
    );

    if (!mounted || action == null) return;

    final source = action == 'camera'
        ? ImageSource.camera
        : ImageSource.gallery;
    final XFile? image = await _imagePicker.pickImage(
      source: source,
      preferredCameraDevice: CameraDevice.rear,
    );
    if (image != null) {
      appState.updateToneGroupImage(group, image.path);
    }
  }

  Future<void> _confirmRemoveGroupImage(
    AppState appState,
    ToneGroup group,
  ) async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Remove picture?'),
        content: const Text('This will clear the picture for this group.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: Text(AppLocalizations.of(ctx).common_cancel),
          ),
          ElevatedButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            child: Text(AppLocalizations.of(ctx).draw_clear),
          ),
        ],
      ),
    );
    if (confirm == true) {
      appState.removeToneGroupImage(group);
    }
  }
}

/// A simple flow to review one or more tone groups and mark them as reviewed.
class GroupReviewScreen extends StatefulWidget {
  final List<ToneGroup> groups;
  const GroupReviewScreen({super.key, required this.groups});

  @override
  State<GroupReviewScreen> createState() => _GroupReviewScreenState();
}

class _GroupReviewScreenState extends State<GroupReviewScreen> {
  int index = 0;
  bool _tipDismissed = false;

  @override
  Widget build(BuildContext context) {
    final appState = Provider.of<AppState>(context, listen: false);
    final group = widget.groups[index];
    final l10n = AppLocalizations.of(context);

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.review_screen_title(index + 1, widget.groups.length)),
      ),
      body: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              l10n.tm_groupNumber(group.groupNumber),
              style: Theme.of(context).textTheme.titleLarge,
            ),
            const SizedBox(height: 12),
            Expanded(
              child: ListView(
                keyboardDismissBehavior:
                    ScrollViewKeyboardDismissBehavior.onDrag,
                children: [
                  if (group.imagePath != null && group.imagePath!.isNotEmpty)
                    Image.file(
                      File(group.imagePath!),
                      height: 200,
                      fit: BoxFit.cover,
                    ),
                  const SizedBox(height: 12),
                  Text(
                    l10n.tm_groupMembers,
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                  const SizedBox(height: 8),
                  if (!_tipDismissed)
                    Card(
                      elevation: 0,
                      color: Theme.of(
                        context,
                      ).colorScheme.surfaceContainerHighest,
                      child: ListTile(
                        leading: const Icon(Icons.swipe),
                        title: Text(l10n.tm_swipeHint),
                        trailing: IconButton(
                          icon: const Icon(Icons.close),
                          onPressed: () => setState(() => _tipDismissed = true),
                        ),
                      ),
                    ),
                  if (!_tipDismissed) const SizedBox(height: 8),
                  ...group.members.map(
                    (w) => Dismissible(
                      key: ValueKey('review-${w.reference}'),
                      background: Container(
                        color: Colors.blueAccent.withValues(alpha: 0.2),
                        alignment: Alignment.centerLeft,
                        padding: const EdgeInsets.symmetric(horizontal: 16),
                        child: const Icon(Icons.open_in_new),
                      ),
                      secondaryBackground: Container(
                        color: Colors.blueAccent.withValues(alpha: 0.2),
                        alignment: Alignment.centerRight,
                        padding: const EdgeInsets.symmetric(horizontal: 16),
                        child: const Icon(Icons.open_in_new),
                      ),
                      onDismissed: (direction) {
                        Provider.of<AppState>(
                          context,
                          listen: false,
                        ).moveWordForReassignment(w);
                        Navigator.of(context).pop();
                      },
                      child: ListTile(
                        dense: true,
                        title: () {
                          final s = appState.settings!;
                          // two-line priority: gloss > spelling > written
                          final parts = <String>[];
                          if (s.showGloss && s.glossElement != null) {
                            final g = w.fields[s.glossElement!] ?? '';
                            if (g.isNotEmpty) parts.add(g);
                          }
                          if (s.requireUserSpelling) {
                            final u = w.userSpelling ?? '';
                            if (u.isNotEmpty) parts.add(u);
                          }
                          if (s.showWrittenForm) {
                            final wf = w.getDisplayText(s.writtenFormElements);
                            if (wf.isNotEmpty) parts.add(wf);
                          }
                          final titleText = parts.isNotEmpty ? parts[0] : '';
                          return Text(
                            titleText,
                            overflow: TextOverflow.ellipsis,
                            maxLines: 1,
                          );
                        }(),
                        subtitle: () {
                          final s = appState.settings!;
                          final parts = <String>[];
                          if (s.showGloss && s.glossElement != null) {
                            final g = w.fields[s.glossElement!] ?? '';
                            if (g.isNotEmpty) parts.add(g);
                          }
                          if (s.requireUserSpelling) {
                            final u = w.userSpelling ?? '';
                            if (u.isNotEmpty) parts.add(u);
                          }
                          if (s.showWrittenForm) {
                            final wf = w.getDisplayText(s.writtenFormElements);
                            if (wf.isNotEmpty) parts.add(wf);
                          }
                          if (parts.length >= 2) {
                            return Text(
                              parts[1],
                              overflow: TextOverflow.ellipsis,
                              maxLines: 1,
                            );
                          }
                          return null;
                        }(),
                        trailing: IconButton(
                          icon: const Icon(Icons.play_arrow),
                          onPressed: () async {
                            try {
                              await appState.playWord(w);
                            } catch (e) {
                              if (!context.mounted) return;
                              ScaffoldMessenger.of(context).showSnackBar(
                                SnackBar(content: Text(l10n.tm_audioError)),
                              );
                            }
                          },
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 8),
          ],
        ),
      ),
      bottomNavigationBar: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
          child: Row(
            children: [
              OutlinedButton(
                onPressed: () {
                  if (index > 0) setState(() => index -= 1);
                },
                child: Text(l10n.review_screen_back),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: ElevatedButton(
                  onPressed: () {
                    appState.markGroupReviewed(group);
                    if (index < widget.groups.length - 1) {
                      setState(() => index += 1);
                    } else {
                      Navigator.of(context).pop();
                    }
                  },
                  child: Text(
                    index < widget.groups.length - 1
                        ? l10n.review_screen_markNext
                        : l10n.review_screen_markFinish,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
