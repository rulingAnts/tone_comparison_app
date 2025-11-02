import 'package:flutter/material.dart';
import 'dart:io';
import 'package:provider/provider.dart';
import 'package:image_picker/image_picker.dart';
import '../services/app_state.dart';
import '../models/tone_group.dart';
import 'package:tone_comparison_app/generated/app_localizations.dart';
// import '../widgets/tone_group_card.dart'; // no longer used with pager UI

/// Main tone matching workflow screen
class ToneMatchingScreen extends StatefulWidget {
  const ToneMatchingScreen({super.key});

  @override
  State<ToneMatchingScreen> createState() => _ToneMatchingScreenState();
}

class _ToneMatchingScreenState extends State<ToneMatchingScreen> {
  final TextEditingController _spellingController = TextEditingController();
  final ImagePicker _imagePicker = ImagePicker();
  bool _spellingEntered = false;

  @override
  void dispose() {
    _spellingController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(AppLocalizations.of(context).tm_title),
        actions: [
          Consumer<AppState>(
            builder: (context, appState, _) => IconButton(
              icon: const Icon(Icons.undo),
              tooltip: AppLocalizations.of(context).tm_undo,
              onPressed: appState.canUndo
                  ? () {
                      final undone = appState.undoLastAction();
                      if (undone) {
                        setState(() {
                          _spellingEntered =
                              (appState.currentWord?.userSpelling?.isNotEmpty ??
                              false);
                        });
                        ScaffoldMessenger.of(context).showSnackBar(
                          SnackBar(
                            content: Text(AppLocalizations.of(context).tm_undo),
                          ),
                        );
                      }
                    }
                  : null,
            ),
          ),
          IconButton(
            icon: const Icon(Icons.ios_share),
            tooltip: AppLocalizations.of(context).tm_share,
            onPressed: _shareResults,
          ),
        ],
      ),
      body: Consumer<AppState>(
        builder: (context, appState, child) {
          if (appState.isComplete) {
            return _buildCompleteView(appState);
          }

          final currentWord = appState.currentWord;
          if (currentWord == null) {
            return Center(child: Text(AppLocalizations.of(context).tm_noWords));
          }

          final requireSpelling =
              appState.settings?.requireUserSpelling ?? false;
          final hasExistingGroup = currentWord.toneGroup != null;

          return Column(
            children: [
              // Progress indicator
              LinearProgressIndicator(
                value:
                    (appState.currentWordIndex + 1) / appState.records.length,
              ),

              // Word info and audio
              Padding(
                padding: const EdgeInsets.all(16.0),
                child: Column(
                  children: [
                    Text(
                      AppLocalizations.of(context).tm_wordOfTotal(
                        appState.currentWordIndex + 1,
                        appState.records.length,
                      ),
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                    const SizedBox(height: 8),
                    if (appState.settings?.showWrittenForm ?? false) ...[
                      Text(
                        currentWord.getDisplayText(
                          appState.settings!.writtenFormElements,
                        ),
                        style: Theme.of(context).textTheme.headlineMedium,
                      ),
                      const SizedBox(height: 6),
                      if (appState.settings!.showGloss &&
                          (appState.settings!.glossElement != null))
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
                    ],
                    const SizedBox(height: 16),

                    // Play button (graphical icon, no text)
                    IconButton(
                      icon: const Icon(Icons.play_circle_filled),
                      iconSize: 64,
                      color: Theme.of(context).primaryColor,
                      onPressed: () async {
                        final messenger = ScaffoldMessenger.of(context);
                        final l10n = AppLocalizations.of(context);
                        try {
                          await appState.playWord(currentWord);
                        } catch (e) {
                          messenger.showSnackBar(
                            SnackBar(content: Text(l10n.tm_audioError)),
                          );
                        }
                      },
                    ),

                    // User spelling input if required
                    if (requireSpelling && !hasExistingGroup) ...[
                      const SizedBox(height: 16),
                      TextField(
                        controller: _spellingController,
                        decoration: InputDecoration(
                          labelText: AppLocalizations.of(
                            context,
                          ).tm_enterSpelling,
                          border: const OutlineInputBorder(),
                          suffixIcon: IconButton(
                            icon: const Icon(Icons.check),
                            onPressed: () {
                              if (_spellingController.text.isNotEmpty) {
                                appState.updateUserSpelling(
                                  _spellingController.text,
                                );
                                setState(() {
                                  _spellingEntered = true;
                                });
                              }
                            },
                          ),
                        ),
                        onSubmitted: (value) {
                          if (value.isNotEmpty) {
                            appState.updateUserSpelling(value);
                            setState(() {
                              _spellingEntered = true;
                            });
                          }
                        },
                      ),
                    ],
                  ],
                ),
              ),

              // Tone groups list
              if (!requireSpelling || _spellingEntered || hasExistingGroup)
                Expanded(child: _buildToneGroupsPager(appState)),
            ],
          );
        },
      ),
    );
  }

  final PageController _pageController = PageController();
  int _currentGroupPage = 0;

  Widget _buildToneGroupsPager(AppState appState) {
    final groups = appState.toneGroups;
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                AppLocalizations.of(context).tm_selectGroup,
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
    return SingleChildScrollView(
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
                // Large image
                SizedBox(
                  height: imageHeight.clamp(200.0, 420.0),
                  child: group.imagePath != null && group.imagePath!.isNotEmpty
                      ? Image.file(File(group.imagePath!), fit: BoxFit.cover)
                      : Container(
                          color: theme.colorScheme.surfaceContainerHighest,
                          child: const Center(
                            child: Icon(Icons.image_not_supported, size: 72),
                          ),
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
                        onPressed: () => _selectToneGroup(appState, group),
                        icon: const Icon(Icons.add_circle_outline),
                        label: Text(AppLocalizations.of(context).tm_addWord),
                        style: ElevatedButton.styleFrom(
                          padding: const EdgeInsets.symmetric(vertical: 12),
                        ),
                      ),
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
          // Members list with play buttons
          ...group.members.map(
            (word) => ListTile(
              dense: true,
              title: Text(
                '${word.reference}  •  '
                '${word.getDisplayText(appState.settings!.writtenFormElements)}',
              ),
              subtitle:
                  (appState.settings!.showGloss &&
                      appState.settings!.glossElement != null &&
                      (word.fields[appState.settings!.glossElement!] ?? '')
                          .isNotEmpty)
                  ? Text(word.fields[appState.settings!.glossElement!]!)
                  : null,
              trailing: IconButton(
                icon: const Icon(Icons.play_arrow),
                onPressed: () async {
                  final messenger = ScaffoldMessenger.of(context);
                  final l10n = AppLocalizations.of(context);
                  try {
                    await appState.playWord(word);
                  } catch (e) {
                    messenger.showSnackBar(
                      SnackBar(content: Text(l10n.tm_audioError)),
                    );
                  }
                },
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
                  AppLocalizations.of(context).tm_createGroupTitle,
                  style: theme.textTheme.titleLarge,
                ),
                const SizedBox(height: 8),
                Text(AppLocalizations.of(context).tm_createGroupSubtitle),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildCompleteView(AppState appState) {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Icon(Icons.check_circle, size: 128, color: Colors.green),
          const SizedBox(height: 32),
          Text(
            AppLocalizations.of(context).tm_allMatched,
            style: Theme.of(context).textTheme.headlineMedium,
          ),
          const SizedBox(height: 16),
          Text(
            AppLocalizations.of(
              context,
            ).tm_groupsCreated(appState.toneGroups.length),
            style: Theme.of(context).textTheme.titleMedium,
          ),
          const SizedBox(height: 32),
          ElevatedButton.icon(
            onPressed: _shareResults,
            icon: const Icon(Icons.ios_share),
            label: Text(AppLocalizations.of(context).tm_share),
          ),
        ],
      ),
    );
  }

  Future<void> _createNewToneGroup(AppState appState) async {
    // Take photo for exemplar
    final XFile? image = await _imagePicker.pickImage(
      source: ImageSource.camera,
      preferredCameraDevice: CameraDevice.rear,
    );

    if (image != null) {
      appState.createNewToneGroup(image.path);
      _moveToNextWord(appState);
    }
  }

  void _selectToneGroup(AppState appState, ToneGroup group) {
    appState.addToToneGroup(group);
    _moveToNextWord(appState);
  }

  void _moveToNextWord(AppState appState) {
    _spellingController.clear();
    setState(() {
      _spellingEntered = false;
    });
    appState.nextWord();
  }

  // Removed legacy _exportResults; sharing is the primary flow now.

  Future<void> _shareResults() async {
    final appState = Provider.of<AppState>(context, listen: false);
    final messenger = ScaffoldMessenger.of(context);
    final l10n = AppLocalizations.of(context);

    try {
      await appState.shareResults();

      messenger.showSnackBar(
        SnackBar(
          content: Text(l10n.export_creating),
          duration: const Duration(seconds: 2),
        ),
      );
    } catch (e) {
      messenger.showSnackBar(
        SnackBar(
          content: Text(l10n.export_failed),
          backgroundColor: Colors.red,
        ),
      );
    }
  }
}
