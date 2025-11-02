import 'package:flutter/material.dart';
import 'dart:io';
import '../models/tone_group.dart';
import '../models/word_record.dart';

/// Widget to display a tone group with exemplar image and word list
class ToneGroupCard extends StatelessWidget {
  final ToneGroup group;
  final VoidCallback onSelect;
  final Function(WordRecord) onPlayWord;

  const ToneGroupCard({
    super.key,
    required this.group,
    required this.onSelect,
    required this.onPlayWord,
  });

  @override
  Widget build(BuildContext context) {
    return Card(
      elevation: 4,
      child: InkWell(
        onTap: onSelect,
        child: Padding(
          padding: const EdgeInsets.all(16.0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  // Group number badge
                  CircleAvatar(
                    backgroundColor: Theme.of(context).primaryColor,
                    child: Text(
                      '${group.groupNumber}',
                      style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ),
                  const SizedBox(width: 16),

                  // Exemplar image
                  if (group.imagePath != null && group.imagePath!.isNotEmpty)
                    Container(
                      width: 100,
                      height: 100,
                      decoration: BoxDecoration(
                        border: Border.all(color: Colors.grey),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: ClipRRect(
                        borderRadius: BorderRadius.circular(8),
                        child: Image.file(
                          File(group.imagePath!),
                          fit: BoxFit.cover,
                          errorBuilder: (context, error, stackTrace) {
                            return const Icon(Icons.image_not_supported);
                          },
                        ),
                      ),
                    )
                  else
                    Container(
                      width: 100,
                      height: 100,
                      decoration: BoxDecoration(
                        border: Border.all(color: Colors.grey),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: const Icon(Icons.image, size: 48),
                    ),

                  const SizedBox(width: 16),

                  // Word count
                  Expanded(
                    child: Text(
                      '${group.members.length} word${group.members.length != 1 ? 's' : ''}',
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                  ),

                  // Select icon
                  const Icon(Icons.check_circle_outline, size: 32),
                ],
              ),

              const SizedBox(height: 16),
              const Divider(),
              const SizedBox(height: 8),

              // List of words in this group (scrollable if many)
              ...group.members
                  .take(5)
                  .map(
                    (word) => Padding(
                      padding: const EdgeInsets.symmetric(vertical: 4),
                      child: Row(
                        children: [
                          IconButton(
                            icon: const Icon(Icons.play_arrow),
                            iconSize: 20,
                            onPressed: () => onPlayWord(word),
                          ),
                          Expanded(
                            child: Text(
                              word.userSpelling ??
                                  word.fields['Phonetic'] ??
                                  word.reference,
                              style: const TextStyle(fontSize: 16),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),

              if (group.members.length > 5)
                Padding(
                  padding: const EdgeInsets.only(top: 8),
                  child: Text(
                    '...and ${group.members.length - 5} more',
                    style: TextStyle(
                      fontStyle: FontStyle.italic,
                      color: Colors.grey[600],
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
