import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:open_filex/open_filex.dart';
import 'package:path_provider/path_provider.dart';
import 'package:video_player/video_player.dart';

/// The same selected attachment appears in the picker and message preview.
class TemplateMediaPreview extends StatefulWidget {
  const TemplateMediaPreview({
    super.key,
    required this.type,
    this.dataBase64,
    this.fileName,
    this.url,
    this.height = 160,
  });
  final String type;
  final String? dataBase64, fileName, url;
  final double height;

  @override
  State<TemplateMediaPreview> createState() => _TemplateMediaPreviewState();
}

class _TemplateMediaPreviewState extends State<TemplateMediaPreview> {
  VideoPlayerController? _video;
  final _directories = <Directory>[];
  String? _error;
  int _generation = 0;

  @override
  void initState() {
    super.initState();
    _loadVideo();
  }

  @override
  void didUpdateWidget(covariant TemplateMediaPreview oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.dataBase64 != oldWidget.dataBase64 ||
        widget.url != oldWidget.url ||
        widget.type != oldWidget.type) {
      _release();
      _error = null;
      _loadVideo();
    }
  }

  Future<File> _localFile(String dataBase64, String fileName) async {
    final temp = await getTemporaryDirectory();
    final directory = await Directory(
      temp.path,
    ).createTemp('greetsync-preview-');
    final name = fileName.split(RegExp(r'[/\\]')).last;
    final safeName = name.replaceAll(RegExp(r'[^a-zA-Z0-9._ -]'), '_');
    try {
      final file = await File(
        '${directory.path}/${safeName.isEmpty ? 'attachment' : safeName}',
      ).writeAsBytes(base64Decode(dataBase64));
      if (!mounted) {
        await directory.delete(recursive: true);
        throw StateError('Preview closed');
      }
      _directories.add(directory);
      return file;
    } catch (_) {
      if (await directory.exists()) await directory.delete(recursive: true);
      rethrow;
    }
  }

  Future<void> _loadVideo() async {
    final generation = ++_generation;
    final dataBase64 = widget.dataBase64;
    final filename = widget.fileName ?? 'video.mp4';
    final url = widget.url;
    if (widget.type != 'VIDEO' ||
        ((widget.dataBase64 ?? '').isEmpty && (widget.url ?? '').isEmpty))
      return;
    VideoPlayerController? controller;
    try {
      controller = (widget.dataBase64 ?? '').isNotEmpty
          ? VideoPlayerController.file(await _localFile(dataBase64!, filename))
          : VideoPlayerController.networkUrl(Uri.parse(url!));
      await controller.initialize();
      if (!mounted || generation != _generation) {
        await controller.dispose();
        return;
      }
      setState(() => _video = controller);
    } catch (_) {
      await controller?.dispose();
      if (mounted && generation == _generation)
        setState(
          () => _error =
              'Unable to play this video. Choose a supported MP4 file.',
        );
    }
  }

  Future<void> _openDocument() async {
    try {
      final file = await _localFile(
        widget.dataBase64!,
        widget.fileName ?? 'document.pdf',
      );
      final result = await OpenFilex.open(file.path);
      if (mounted && result.type != ResultType.done)
        setState(() => _error = result.message);
    } catch (_) {
      if (mounted)
        setState(() => _error = 'Unable to open the selected document.');
    }
  }

  void _release() {
    _generation++;
    final controller = _video;
    _video = null;
    final directories = _directories.toList();
    _directories.clear();
    // A player must release its file before the temporary directory is deleted.
    Future<void>(() async {
      try {
        await controller?.dispose();
        for (final directory in directories) {
          if (await directory.exists()) await directory.delete(recursive: true);
        }
      } catch (_) {}
    });
  }

  @override
  void dispose() {
    _release();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final available =
        (widget.dataBase64 ?? '').isNotEmpty || (widget.url ?? '').isNotEmpty;
    final type = widget.type.toUpperCase();
    Widget content;
    if (type == 'IMAGE' && available) {
      Widget error(BuildContext context, Object error, StackTrace? stack) =>
          const Padding(
            padding: EdgeInsets.all(16),
            child: Text('Unable to preview this image. Choose it again.'),
          );
      try {
        content = (widget.dataBase64 ?? '').isNotEmpty
            ? Image.memory(
                base64Decode(widget.dataBase64!),
                height: widget.height,
                width: double.infinity,
                fit: BoxFit.contain,
                errorBuilder: error,
              )
            : Image.network(
                widget.url!,
                height: widget.height,
                width: double.infinity,
                fit: BoxFit.contain,
                errorBuilder: error,
              );
      } catch (_) {
        content = const Text('Invalid image data. Choose the image again.');
      }
    } else if (type == 'VIDEO' && available && _video != null) {
      content = Column(
        children: [
          SizedBox(
            height: widget.height,
            child: AspectRatio(
              aspectRatio: _video!.value.aspectRatio,
              child: VideoPlayer(_video!),
            ),
          ),
          VideoProgressIndicator(_video!, allowScrubbing: true),
          IconButton(
            tooltip: 'Play or pause preview',
            icon: Icon(
              _video!.value.isPlaying ? Icons.pause_circle : Icons.play_circle,
            ),
            onPressed: () async {
              final player = _video!;
              player.value.isPlaying
                  ? await player.pause()
                  : await player.play();
              if (mounted) setState(() {});
            },
          ),
        ],
      );
    } else {
      content = Padding(
        padding: const EdgeInsets.all(12),
        child: Row(
          children: [
            Icon(
              type == 'VIDEO'
                  ? Icons.video_file_outlined
                  : type == 'DOCUMENT'
                  ? Icons.description_outlined
                  : Icons.image_outlined,
              size: 30,
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                widget.fileName ??
                    (available
                        ? '$type header'
                        : 'Choose ${type.toLowerCase()} for this header'),
              ),
            ),
            if (type == 'VIDEO' && available && _error == null)
              const SizedBox(
                width: 20,
                height: 20,
                child: CircularProgressIndicator(strokeWidth: 2),
              ),
            if (type == 'DOCUMENT' && (widget.dataBase64 ?? '').isNotEmpty)
              IconButton(
                tooltip: 'View document',
                onPressed: _openDocument,
                icon: const Icon(Icons.open_in_new_rounded),
              ),
          ],
        ),
      );
    }
    return ClipRRect(
      borderRadius: BorderRadius.circular(12),
      child: Container(
        width: double.infinity,
        color: const Color(0xFFF4F7FB),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            content,
            if (_error != null)
              Padding(
                padding: const EdgeInsets.all(8),
                child: Text(_error!, style: const TextStyle(color: Colors.red)),
              ),
          ],
        ),
      ),
    );
  }
}
