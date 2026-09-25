import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../providers/providers.dart';
import '../theme/business_theme.dart';

class AppearanceScreen extends ConsumerWidget {
  const AppearanceScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final preference = ref.watch(themeProvider);
    final accent = Theme.of(context).colorScheme.primary;

    return Scaffold(
      appBar: AppBar(title: const Text('Themes & Colors')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(18, 10, 18, 32),
        children: [
          const Text('App appearance', style: TextStyle(fontSize: 23, fontWeight: FontWeight.w900, color: BusinessColors.ink)),
          const SizedBox(height: 5),
          const Text(
            'WishFlow keeps its clean white/off-white layout. Choose an accent color below and buttons, selected navigation, switches and supported UI highlights update instantly.',
            style: TextStyle(color: BusinessColors.muted, height: 1.45),
          ),
          const SizedBox(height: 16),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('Live Preview', style: TextStyle(fontWeight: FontWeight.w900, fontSize: 17)),
                  const SizedBox(height: 14),
                  Row(
                    children: [
                      Container(width: 54, height: 54, decoration: BoxDecoration(color: accent.withOpacity(.13), borderRadius: BorderRadius.circular(16)), child: Icon(Icons.palette_outlined, color: accent)),
                      const SizedBox(width: 12),
                      Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text(accentChoiceForKey(preference.accentKey).label, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w900)), const Text('Current accent color', style: TextStyle(color: BusinessColors.muted))])),
                    ],
                  ),
                  const SizedBox(height: 14),
                  Row(children: [
                    Expanded(child: FilledButton(onPressed: () {}, child: const Text('Primary Action'))),
                    const SizedBox(width: 10),
                    Expanded(child: OutlinedButton(onPressed: () {}, child: const Text('Secondary'))),
                  ]),
                ],
              ),
            ),
          ),
          const SizedBox(height: 18),
          const Text('Choose accent color', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900, color: BusinessColors.ink)),
          const SizedBox(height: 10),
          GridView.builder(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            itemCount: appAccentChoices.length,
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount: 3, crossAxisSpacing: 10, mainAxisSpacing: 10, childAspectRatio: 1.15),
            itemBuilder: (context, index) {
              final choice = appAccentChoices[index];
              final selected = preference.accentKey == choice.key;
              return InkWell(
                borderRadius: BorderRadius.circular(16),
                onTap: () => ref.read(themeProvider.notifier).setAccent(choice.key),
                child: Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(color: selected ? choice.color : BusinessColors.line, width: selected ? 2 : 1),
                  ),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Container(
                        width: 38,
                        height: 38,
                        decoration: BoxDecoration(color: choice.color, shape: BoxShape.circle, boxShadow: [BoxShadow(color: choice.color.withOpacity(.18), blurRadius: 8)]),
                        child: selected ? const Icon(Icons.check_rounded, color: Colors.white, size: 21) : null,
                      ),
                      const SizedBox(height: 8),
                      Text(choice.label, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 12, fontWeight: selected ? FontWeight.w900 : FontWeight.w700, color: BusinessColors.ink)),
                    ],
                  ),
                ),
              );
            },
          ),
          const SizedBox(height: 16),
          const Card(
            child: Padding(
              padding: EdgeInsets.all(15),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(Icons.light_mode_outlined),
                  SizedBox(width: 12),
                  Expanded(child: Text('WishFlow currently uses a light white/off-white base theme only. Accent changes are saved on this device and apply with one tap.', style: TextStyle(color: BusinessColors.muted, height: 1.4))),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
