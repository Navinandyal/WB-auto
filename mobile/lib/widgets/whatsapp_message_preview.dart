import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../providers/providers.dart';
import 'template_media_preview.dart';

final savedMediaPreviewProvider = FutureProvider.autoDispose
    .family<Map<String, dynamic>, String>((ref, id) async {
      final data = await ref
          .read(apiClientProvider)
          .get('/api/whatsapp/media/$id/preview');
      return (data as Map).cast<String, dynamic>();
    });

/// Shared message bubble for composer review and persisted message activity.
class WhatsAppMessagePreview extends ConsumerWidget {
  const WhatsAppMessagePreview({
    super.key,
    required this.components,
    this.variables = const {},
    this.mediaBase64,
    this.mediaName,
  });
  final List<dynamic> components;
  final Map<String, String> variables;
  final String? mediaBase64, mediaName;

  String render(String text, String section) =>
      text.replaceAllMapped(RegExp(r'\{\{\s*([^{}]+?)\s*\}\}'), (m) {
        final token = m[1]!.trim();
        return variables['${section.toLowerCase()}_$token'] ??
            (section == 'BODY' ? variables[token] : null) ??
            m[0]!;
      });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    Map header = const {},
        body = const {},
        footer = const {},
        actions = const {};
    for (final c in components.whereType<Map>()) {
      switch ('${c['type']}'.toUpperCase()) {
        case 'HEADER':
          header = c;
          break;
        case 'BODY':
          body = c;
          break;
        case 'FOOTER':
          footer = c;
          break;
        case 'BUTTONS':
          actions = c;
          break;
      }
    }
    final type = '${header['format'] ?? 'TEXT'}'.toUpperCase();
    final buttons =
        (actions['buttons'] is List ? actions['buttons'] as List : const [])
            .whereType<Map>()
            .toList();
    Widget? media;
    if (['IMAGE', 'VIDEO', 'DOCUMENT'].contains(type)) {
      if ((mediaBase64 ?? '').isNotEmpty) {
        media = TemplateMediaPreview(
          type: type,
          dataBase64: mediaBase64,
          fileName: mediaName,
        );
      } else if ((variables['__header_media_id'] ?? '').isNotEmpty) {
        media = ref
            .watch(savedMediaPreviewProvider(variables['__header_media_id']!))
            .when(
              data: (data) => TemplateMediaPreview(
                type: type,
                dataBase64: '${data['dataBase64'] ?? ''}',
                fileName: '${data['fileName'] ?? mediaName ?? 'Attachment'}',
              ),
              loading: () => const SizedBox(
                height: 120,
                child: Center(child: CircularProgressIndicator()),
              ),
              error: (_, __) => ListTile(
                leading: const Icon(Icons.attachment),
                title: Text(
                  variables['__header_media_filename'] ?? 'Attachment',
                ),
                subtitle: const Text('Saved preview unavailable'),
              ),
            );
      } else {
        media = TemplateMediaPreview(
          type: type,
          fileName: mediaName,
          url: variables['__header_media_link'],
        );
      }
    }
    final lat = variables['__header_location_latitude'];
    final lng = variables['__header_location_longitude'];
    if (type == 'LOCATION') {
      media = ListTile(
        contentPadding: EdgeInsets.zero,
        leading: const Icon(
          Icons.location_on,
          color: Color(0xFF008069),
          size: 32,
        ),
        title: Text(variables['__header_location_name'] ?? 'Selected location'),
        subtitle: Text(
          [
            variables['__header_location_address'] ?? '',
            '${lat ?? ''}, ${lng ?? ''}',
          ].where((v) => v.trim().isNotEmpty).join('\n'),
        ),
        onTap: lat == null || lng == null
            ? null
            : () => launchUrl(
                Uri.parse(
                  'https://www.openstreetmap.org/?mlat=$lat&mlon=$lng#map=18/$lat/$lng',
                ),
                mode: LaunchMode.externalApplication,
              ),
      );
    }
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: const Color(0xFFECE5DD),
        borderRadius: BorderRadius.circular(18),
      ),
      child: Align(
        alignment: Alignment.centerLeft,
        child: Container(
          constraints: const BoxConstraints(maxWidth: 380),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(14),
            boxShadow: const [
              BoxShadow(color: Color(0x10000000), blurRadius: 4),
            ],
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Padding(
                padding: const EdgeInsets.all(13),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (media != null) ...[media, const SizedBox(height: 10)],
                    if (type == 'TEXT' &&
                        '${header['text'] ?? ''}'.isNotEmpty) ...[
                      Text(
                        render('${header['text']}', 'HEADER'),
                        style: const TextStyle(fontWeight: FontWeight.w800),
                      ),
                      const SizedBox(height: 8),
                    ],
                    Text(
                      render('${body['text'] ?? ''}', 'BODY'),
                      style: const TextStyle(
                        color: Color(0xFF111B21),
                        height: 1.45,
                      ),
                    ),
                    if ('${footer['text'] ?? ''}'.isNotEmpty) ...[
                      const SizedBox(height: 8),
                      Text(
                        '${footer['text']}',
                        style: const TextStyle(
                          color: Color(0xFF667781),
                          fontSize: 12,
                        ),
                      ),
                    ],
                    const Align(
                      alignment: Alignment.centerRight,
                      child: Text(
                        'Preview',
                        style: TextStyle(
                          color: Color(0xFF8696A0),
                          fontSize: 10,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              ...buttons.map(
                (b) => Container(
                  padding: const EdgeInsets.all(11),
                  decoration: const BoxDecoration(
                    border: Border(top: BorderSide(color: Color(0xFFE9EDEF))),
                  ),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(
                        '${b['type']}' == 'FLOW'
                            ? Icons.assignment_outlined
                            : Icons.touch_app_outlined,
                        size: 16,
                        color: const Color(0xFF0086C9),
                      ),
                      const SizedBox(width: 7),
                      Flexible(
                        child: Text(
                          '${b['text'] ?? ('${b['type']}' == 'COPY_CODE' ? 'Copy code' : 'Open')}',
                          textAlign: TextAlign.center,
                          style: const TextStyle(
                            color: Color(0xFF0086C9),
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                    ],
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
