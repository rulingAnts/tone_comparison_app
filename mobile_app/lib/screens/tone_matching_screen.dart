import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:image_picker/image_picker.dart';
import '../services/app_state.dart';
import '../models/tone_group.dart';
import '../widgets/tone_group_card.dart';

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
        title: const Text('Tone Matching'),
        actions: [
          IconButton(
            icon: const Icon(Icons.download),
            onPressed: _exportResults,
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
            return const Center(child: Text('No words to match'));
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
                      'Word ${appState.currentWordIndex + 1} of ${appState.records.length}',
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                    const SizedBox(height: 8),
                    if (appState.settings?.showWrittenForm ?? false)
                      Text(
                        currentWord.getDisplayText(
                          appState.settings!.writtenFormElements,
                        ),
                        style: Theme.of(context).textTheme.headlineMedium,
                      ),
                    const SizedBox(height: 16),

                    // Play button (graphical icon, no text)
                    IconButton(
                      icon: const Icon(Icons.play_circle_filled),
                      iconSize: 64,
                      color: Theme.of(context).primaryColor,
                      onPressed: () => appState.playWord(currentWord),
                    ),

                    // User spelling input if required
                    if (requireSpelling && !hasExistingGroup) ...[
                      const SizedBox(height: 16),
                      TextField(
                        controller: _spellingController,
                        decoration: InputDecoration(
                          labelText: 'Enter spelling',
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
                Expanded(child: _buildToneGroupsList(appState)),
            ],
          );
        },
      ),
    );
  }

  Widget _buildToneGroupsList(AppState appState) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Text(
          'Select or create a tone group:',
          style: Theme.of(context).textTheme.titleMedium,
        ),
        const SizedBox(height: 16),

        // Existing tone groups
        ...appState.toneGroups.map(
          (group) => Padding(
            padding: const EdgeInsets.only(bottom: 16),
            child: ToneGroupCard(
              group: group,
              onSelect: () => _selectToneGroup(appState, group),
              onPlayWord: (word) => appState.playWord(word),
            ),
          ),
        ),

        // Create new group button
        Card(
          child: InkWell(
            onTap: () => _createNewToneGroup(appState),
            child: Padding(
              padding: const EdgeInsets.all(24.0),
              child: Column(
                children: [
                  Icon(
                    Icons.add_circle_outline,
                    size: 64,
                    color: Theme.of(context).primaryColor,
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'Create New Group',
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                ],
              ),
            ),
          ),
        ),
      ],
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
            'All words matched!',
            style: Theme.of(context).textTheme.headlineMedium,
          ),
          const SizedBox(height: 16),
          Text(
            '${appState.toneGroups.length} tone groups created',
            style: Theme.of(context).textTheme.titleMedium,
          ),
          const SizedBox(height: 32),
          ElevatedButton.icon(
            onPressed: _exportResults,
            icon: const Icon(Icons.download),
            label: const Text('Export Results'),
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

  Future<void> _exportResults() async {
    final appState = Provider.of<AppState>(context, listen: false);

    try {
      final zipPath = await appState.exportResults();

      if (!mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Results exported to: $zipPath'),
          duration: const Duration(seconds: 5),
          action: SnackBarAction(label: 'OK', onPressed: () {}),
        ),
      );
    } catch (e) {
      if (!mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Export failed: $e'),
          backgroundColor: Colors.red,
        ),
      );
    }
  }
}
