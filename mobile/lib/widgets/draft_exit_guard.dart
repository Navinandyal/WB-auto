import 'package:flutter/material.dart';
import '../core/editor_drafts.dart';

/// The shell must consult editors before popUntil or switching bottom tabs.
class EditorExitController {
  final _editors = <DraftExitGuardState>[];
  bool _checking = false;
  bool get hasEditors => _editors.any((e) => e.mounted);
  Future<bool> prepareNavigation() async {
    if (_checking) return false;
    _checking = true;
    try {
      for (final editor in List<DraftExitGuardState>.from(_editors.reversed)) {
        if (editor.mounted && !await editor.confirmLeave()) return false;
      }
      return true;
    } finally {
      _checking = false;
    }
  }

  Future<void> allowEditorPops() async {
    for (final editor in List<DraftExitGuardState>.from(_editors))
      if (editor.mounted) editor.allowExit();
    await WidgetsBinding.instance.endOfFrame;
  }
}

class EditorExitScope extends InheritedWidget {
  const EditorExitScope({
    super.key,
    required this.controller,
    required super.child,
  });
  final EditorExitController controller;
  static EditorExitController? of(BuildContext context) =>
      context.dependOnInheritedWidgetOfExactType<EditorExitScope>()?.controller;
  @override
  bool updateShouldNotify(EditorExitScope oldWidget) =>
      oldWidget.controller != controller;
}

class DraftExitGuard extends StatefulWidget {
  const DraftExitGuard({
    super.key,
    required this.child,
    required this.title,
    required this.hasChanges,
    required this.saveDraft,
    required this.discardDraft,
    required this.isBusy,
  });
  final Widget child;
  final String title;
  final bool Function() hasChanges, isBusy;
  final Future<void> Function() saveDraft, discardDraft;
  @override
  State<DraftExitGuard> createState() => DraftExitGuardState();
}

class DraftExitGuardState extends State<DraftExitGuard> {
  bool _allowPop = false, _asking = false;
  EditorExitController? _controller;
  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final next = EditorExitScope.of(context);
    if (next != _controller) {
      _controller?._editors.remove(this);
      _controller = next;
      _controller?._editors.add(this);
    }
  }

  @override
  void dispose() {
    _controller?._editors.remove(this);
    super.dispose();
  }

  void allowExit() {
    if (mounted) setState(() => _allowPop = true);
  }

  Future<void> finish([Object? result]) async {
    allowExit();
    await WidgetsBinding.instance.endOfFrame;
    if (mounted) Navigator.of(context).pop(result);
  }

  Future<bool> confirmLeave() async {
    if (_asking) return false;
    if (widget.isBusy()) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Wait for the current operation to finish before leaving.',
          ),
        ),
      );
      return false;
    }
    if (!widget.hasChanges()) return true;
    _asking = true;
    try {
      final choice = await showDialog<String>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: Text('Save ${widget.title} before leaving?'),
          content: const Text(
            'Save your unfinished work as a draft on this device, or discard it. Saving a draft does not submit or send anything.',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx),
              child: const Text('Keep editing'),
            ),
            TextButton(
              onPressed: () => Navigator.pop(ctx, 'DISCARD'),
              child: const Text('Discard'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(ctx, 'SAVE'),
              child: const Text('Save as draft'),
            ),
          ],
        ),
      );
      if (choice == null || !mounted) return false;
      if (choice == 'SAVE')
        await widget.saveDraft();
      else
        await widget.discardDraft();
      return mounted;
    } catch (_) {
      if (mounted)
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              'Could not save or remove the draft. Your work is still open. Try again.',
            ),
          ),
        );
      return false;
    } finally {
      _asking = false;
    }
  }

  @override
  Widget build(BuildContext context) => PopScope<Object?>(
    canPop: _allowPop,
    onPopInvokedWithResult: (didPop, result) async {
      if (!didPop && await confirmLeave() && mounted) await finish(result);
    },
    child: widget.child,
  );
}

Future<Map<String, dynamic>?> offerEditorDraft(
  BuildContext context,
  EditorDraftStore store,
  String kind,
) async {
  final draft = await store.load(kind);
  if (draft == null || !context.mounted) return null;
  final choice = await showDialog<String>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: const Text('Continue your saved draft?'),
      content: const Text(
        'This draft was saved on this device for your business. It has not been sent or submitted.',
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(ctx, 'DISCARD'),
          child: const Text('Discard saved draft'),
        ),
        FilledButton(
          onPressed: () => Navigator.pop(ctx, 'RESUME'),
          child: const Text('Continue draft'),
        ),
      ],
    ),
  );
  if (choice == 'DISCARD') {
    await store.remove(kind);
    return null;
  }
  if (choice == null) throw const EditorDraftSelectionCancelled();
  return draft;
}

class EditorDraftSelectionCancelled implements Exception {
  const EditorDraftSelectionCancelled();
}
