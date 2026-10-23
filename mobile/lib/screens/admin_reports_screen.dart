import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../core/api_client.dart';
import '../providers/providers.dart';
import '../theme/business_theme.dart';
import '../widgets/admin_ui.dart';

class AdminReportsScreen extends ConsumerStatefulWidget {
  const AdminReportsScreen({super.key});

  @override
  ConsumerState<AdminReportsScreen> createState() => _AdminReportsScreenState();
}

class _AdminReportsScreenState extends ConsumerState<AdminReportsScreen>
    with SingleTickerProviderStateMixin {
  Map<String, dynamic>? data;
  bool loading = true;
  String? error;
  late final AnimationController controller;

  @override
  void initState() {
    super.initState();
    controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 850),
    );
    _load();
  }

  @override
  void dispose() {
    controller.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final d =
          (await ref.read(apiClientProvider).get('/api/admin/reports') as Map)
              .cast<String, dynamic>();
      if (!mounted) return;
      setState(() {
        data = d;
        loading = false;
        error = null;
      });
      controller.forward(from: 0);
    } catch (e) {
      if (!mounted) return;
      setState(() {
        error = e is ApiException ? e.message : '$e';
        loading = false;
      });
    }
  }

  Map<String, dynamic> _map(String key) =>
      (data?[key] as Map?)?.cast<String, dynamic>() ?? {};
  int _n(dynamic value) => value is int ? value : int.tryParse('$value') ?? 0;

  @override
  Widget build(BuildContext context) {
    if (loading) return const Center(child: CircularProgressIndicator());

    final businesses = _map('businesses');
    final contacts = _map('contacts');
    final messages = _map('messages');
    final automations = _map('automations');
    final templates = _map('templates');
    final trend = ((data?['trends'] as Map?)?['messages'] as List? ?? [])
        .whereType<Map>()
        .map((e) => e.cast<String, dynamic>())
        .toList();
    final categories = (data?['templateCategories'] as List? ?? [])
        .whereType<Map>()
        .map((e) => e.cast<String, dynamic>())
        .toList();
    final topBusinesses = (data?['topBusinesses'] as List? ?? [])
        .whereType<Map>()
        .map((e) => e.cast<String, dynamic>())
        .toList();

    final sent = _n(messages['sent']);
    final delivered = _n(messages['delivered']);
    final read = _n(messages['read']);
    final failed = _n(messages['failed']);
    final deliveryRate = sent == 0
        ? 0.0
        : (delivered / sent * 100).clamp(0, 100).toDouble();

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
        children: [
          AdminHeader(
            'Reports & analytics',
            'Review platform growth, business usage and message activity.',
            icon: Icons.bar_chart_outlined,
            action: OutlinedButton.icon(
              onPressed: _load,
              icon: const Icon(Icons.refresh),
              label: const Text('Refresh reports'),
            ),
          ),
          if (error != null) ...[
            const SizedBox(height: 10),
            Text(error!, style: const TextStyle(color: Colors.red)),
          ],
          const SizedBox(height: 16),
          GridView.count(
            crossAxisCount: 2,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            childAspectRatio: 1.55,
            mainAxisSpacing: 10,
            crossAxisSpacing: 10,
            children: [
              _Kpi(
                icon: Icons.business_rounded,
                label: 'Businesses',
                value: '${_n(businesses['total'])}',
                caption: '${_n(businesses['active'])} active',
                color: const Color(0xFF2F80ED),
              ),
              _Kpi(
                icon: Icons.people_alt_rounded,
                label: 'Contacts',
                value: '${_n(contacts['total'])}',
                caption: 'Across all businesses',
                color: const Color(0xFF7C4DFF),
              ),
              _Kpi(
                icon: Icons.send_rounded,
                label: 'Messages',
                value: '${_n(messages['total'])}',
                caption: '${deliveryRate.toStringAsFixed(0)}% delivered',
                color: BusinessColors.green,
              ),
              _Kpi(
                icon: Icons.auto_awesome_rounded,
                label: 'Automations',
                value: '${_n(automations['total'])}',
                caption: '${_n(automations['scheduled'])} scheduled',
                color: const Color(0xFFFF9800),
              ),
            ],
          ),
          const SizedBox(height: 16),
          _ChartCard(
            title: 'Message Delivery Trend',
            subtitle: 'Last 7 days',
            child: SizedBox(
              height: 220,
              child: AnimatedBuilder(
                animation: controller,
                builder: (_, __) => CustomPaint(
                  painter: _LineChartPainter(
                    trend: trend,
                    progress: Curves.easeOutCubic.transform(controller.value),
                  ),
                  child: const SizedBox.expand(),
                ),
              ),
            ),
          ),
          const SizedBox(height: 14),
          LayoutBuilder(
            builder: (context, constraints) {
              final ring = _DeliveryRing(
                delivered: delivered,
                read: read,
                failed: failed,
                total: math.max(1, _n(messages['total'])),
                progress: controller,
              );
              final health = _StatusPanel(
                automations: automations,
                templates: templates,
              );
              if (constraints.maxWidth < 520) {
                return Column(
                  children: [ring, const SizedBox(height: 12), health],
                );
              }
              return Row(
                children: [
                  Expanded(child: ring),
                  const SizedBox(width: 12),
                  Expanded(child: health),
                ],
              );
            },
          ),
          const SizedBox(height: 14),
          _topBusinessesCard(context, topBusinesses),
          const SizedBox(height: 14),
          _templateCategoryCard(categories),
        ],
      ),
    );
  }

  Widget _topBusinessesCard(
    BuildContext context,
    List<Map<String, dynamic>> top,
  ) {
    final maxCount = top.isEmpty
        ? 1
        : top.map((e) => _n(e['messages'])).fold<int>(1, math.max);
    return _ChartCard(
      title: 'Top Businesses by Messages',
      subtitle: 'Current database activity',
      child: top.isEmpty
          ? const Padding(
              padding: EdgeInsets.all(20),
              child: Center(
                child: Text(
                  'No message activity yet.',
                  style: TextStyle(color: BusinessColors.muted),
                ),
              ),
            )
          : Column(
              children: top.asMap().entries.map((entry) {
                final item = entry.value;
                final count = _n(item['messages']);
                final ratio = maxCount == 0 ? 0.0 : count / maxCount;
                return Padding(
                  padding: const EdgeInsets.symmetric(vertical: 8),
                  child: Row(
                    children: [
                      Container(
                        width: 28,
                        height: 28,
                        alignment: Alignment.center,
                        decoration: BoxDecoration(
                          color: Theme.of(
                            context,
                          ).colorScheme.primary.withOpacity(.10),
                          shape: BoxShape.circle,
                        ),
                        child: Text(
                          '${entry.key + 1}',
                          style: TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w900,
                            color: Theme.of(context).colorScheme.primary,
                          ),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                Expanded(
                                  child: Text(
                                    '${item['name']}',
                                    style: const TextStyle(
                                      fontWeight: FontWeight.w800,
                                    ),
                                  ),
                                ),
                                Text(
                                  '$count',
                                  style: const TextStyle(
                                    fontWeight: FontWeight.w900,
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: 6),
                            TweenAnimationBuilder<double>(
                              tween: Tween(begin: 0, end: ratio),
                              duration: const Duration(milliseconds: 800),
                              builder: (_, value, __) => ClipRRect(
                                borderRadius: BorderRadius.circular(8),
                                child: LinearProgressIndicator(
                                  value: value,
                                  minHeight: 7,
                                  backgroundColor: const Color(0xFFE8EEF5),
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                );
              }).toList(),
            ),
    );
  }

  Widget _templateCategoryCard(List<Map<String, dynamic>> categories) {
    return _ChartCard(
      title: 'Template Categories',
      subtitle: 'Templates across the platform',
      child: Wrap(
        spacing: 10,
        runSpacing: 10,
        children: categories.map((c) {
          final category = '${c['category']}';
          return Container(
            width: 145,
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: const Color(0xFFF7F9FC),
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: BusinessColors.line),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(_catIcon(category), color: _catColor(category)),
                const SizedBox(height: 10),
                Text(
                  '${_n(c['count'])}',
                  style: const TextStyle(
                    fontSize: 23,
                    fontWeight: FontWeight.w900,
                  ),
                ),
                Text(
                  category.toLowerCase(),
                  style: const TextStyle(color: BusinessColors.muted),
                ),
              ],
            ),
          );
        }).toList(),
      ),
    );
  }

  static IconData _catIcon(String c) => c == 'MARKETING'
      ? Icons.campaign_outlined
      : c == 'UTILITY'
      ? Icons.description_outlined
      : Icons.security_outlined;
  static Color _catColor(String c) => c == 'MARKETING'
      ? const Color(0xFFE83E8C)
      : c == 'UTILITY'
      ? const Color(0xFF2F80ED)
      : const Color(0xFF7C4DFF);
}

class _Kpi extends StatelessWidget {
  const _Kpi({
    required this.icon,
    required this.label,
    required this.value,
    required this.caption,
    required this.color,
  });
  final IconData icon;
  final String label, value, caption;
  final Color color;

  @override
  Widget build(BuildContext context) => Card(
    child: Padding(
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(
              color: color.withOpacity(.11),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Icon(icon, color: color, size: 20),
          ),
          const Spacer(),
          Text(
            value,
            style: const TextStyle(
              fontSize: 23,
              fontWeight: FontWeight.w900,
              color: BusinessColors.ink,
            ),
          ),
          Text(
            label,
            style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 12),
          ),
          Text(
            caption,
            style: const TextStyle(color: BusinessColors.muted, fontSize: 10),
          ),
        ],
      ),
    ),
  );
}

class _ChartCard extends StatelessWidget {
  const _ChartCard({
    required this.title,
    required this.subtitle,
    required this.child,
  });
  final String title, subtitle;
  final Widget child;
  @override
  Widget build(BuildContext context) => Card(
    child: Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w900),
          ),
          Text(
            subtitle,
            style: const TextStyle(color: BusinessColors.muted, fontSize: 12),
          ),
          const SizedBox(height: 14),
          child,
        ],
      ),
    ),
  );
}

class _DeliveryRing extends StatelessWidget {
  const _DeliveryRing({
    required this.delivered,
    required this.read,
    required this.failed,
    required this.total,
    required this.progress,
  });
  final int delivered, read, failed, total;
  final Animation<double> progress;

  @override
  Widget build(BuildContext context) => Card(
    child: Padding(
      padding: const EdgeInsets.all(14),
      child: Column(
        children: [
          const Align(
            alignment: Alignment.centerLeft,
            child: Text(
              'Message Status',
              style: TextStyle(fontWeight: FontWeight.w900),
            ),
          ),
          const SizedBox(height: 12),
          SizedBox(
            width: 120,
            height: 120,
            child: AnimatedBuilder(
              animation: progress,
              builder: (_, __) => CustomPaint(
                painter: _RingPainter(
                  delivered: delivered,
                  read: read,
                  failed: failed,
                  total: total,
                  progress: progress.value,
                ),
                child: Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Text(
                        '$delivered',
                        style: const TextStyle(
                          fontSize: 21,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                      const Text(
                        'delivered',
                        style: TextStyle(
                          fontSize: 10,
                          color: BusinessColors.muted,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
          const SizedBox(height: 12),
          _legend(BusinessColors.green, 'Delivered', delivered),
          _legend(const Color(0xFF2F80ED), 'Read', read),
          _legend(Colors.redAccent, 'Failed', failed),
        ],
      ),
    ),
  );

  Widget _legend(Color color, String title, int value) => Padding(
    padding: const EdgeInsets.only(top: 5),
    child: Row(
      children: [
        Container(
          width: 8,
          height: 8,
          decoration: BoxDecoration(color: color, shape: BoxShape.circle),
        ),
        const SizedBox(width: 6),
        Expanded(child: Text(title, style: const TextStyle(fontSize: 11))),
        Text(
          '$value',
          style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w800),
        ),
      ],
    ),
  );
}

class _StatusPanel extends StatelessWidget {
  const _StatusPanel({required this.automations, required this.templates});
  final Map<String, dynamic> automations, templates;
  int _n(dynamic v) => v is int ? v : int.tryParse('$v') ?? 0;

  @override
  Widget build(BuildContext context) => Card(
    child: Padding(
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Operational Health',
            style: TextStyle(fontWeight: FontWeight.w900),
          ),
          const SizedBox(height: 12),
          _row(
            Icons.schedule_rounded,
            'Scheduled',
            '${_n(automations['scheduled'])}',
            const Color(0xFF2F80ED),
          ),
          _row(
            Icons.check_circle_outline,
            'Sent',
            '${_n(automations['sent'])}',
            BusinessColors.green,
          ),
          _row(
            Icons.error_outline,
            'Failed',
            '${_n(automations['failed'])}',
            Colors.redAccent,
          ),
          const Divider(),
          _row(
            Icons.verified_outlined,
            'Approved templates',
            '${_n(templates['approved'])}',
            const Color(0xFF7C4DFF),
          ),
          _row(
            Icons.hourglass_bottom_rounded,
            'Pending templates',
            '${_n(templates['pending'])}',
            Colors.orange,
          ),
        ],
      ),
    ),
  );

  Widget _row(IconData icon, String label, String value, Color color) =>
      Padding(
        padding: const EdgeInsets.symmetric(vertical: 7),
        child: Row(
          children: [
            Icon(icon, size: 18, color: color),
            const SizedBox(width: 8),
            Expanded(child: Text(label, style: const TextStyle(fontSize: 11))),
            Text(value, style: const TextStyle(fontWeight: FontWeight.w900)),
          ],
        ),
      );
}

class _LineChartPainter extends CustomPainter {
  _LineChartPainter({required this.trend, required this.progress});
  final List<Map<String, dynamic>> trend;
  final double progress;

  @override
  void paint(Canvas canvas, Size size) {
    final grid = Paint()
      ..color = const Color(0xFFE8EEF5)
      ..strokeWidth = 1;
    for (int i = 0; i < 4; i++) {
      final y = 20 + (size.height - 55) * i / 3;
      canvas.drawLine(Offset(10, y), Offset(size.width - 10, y), grid);
    }
    if (trend.isEmpty) return;
    int n(dynamic v) => v is int ? v : int.tryParse('$v') ?? 0;
    final maxV = math.max(
      1,
      trend
          .expand((e) => [n(e['sent']), n(e['delivered']), n(e['failed'])])
          .fold<int>(0, math.max),
    );

    void draw(String key, Color color) {
      final path = Path();
      for (int i = 0; i < trend.length; i++) {
        final x = 14 + (size.width - 28) * i / math.max(1, trend.length - 1);
        final value = n(trend[i][key]);
        final y = 20 + (size.height - 55) * (1 - (value / maxV) * progress);
        if (i == 0)
          path.moveTo(x, y);
        else
          path.lineTo(x, y);
      }
      canvas.drawPath(
        path,
        Paint()
          ..color = color
          ..strokeWidth = 3
          ..style = PaintingStyle.stroke
          ..strokeCap = StrokeCap.round,
      );
    }

    draw('sent', const Color(0xFF2F80ED));
    draw('delivered', BusinessColors.green);
    draw('failed', Colors.redAccent);

    final text = TextPainter(textDirection: TextDirection.ltr);
    for (int i = 0; i < trend.length; i++) {
      final x = 14 + (size.width - 28) * i / math.max(1, trend.length - 1);
      text.text = TextSpan(
        text: '${trend[i]['label'] ?? ''}',
        style: const TextStyle(fontSize: 9, color: BusinessColors.muted),
      );
      text.layout();
      text.paint(canvas, Offset(x - text.width / 2, size.height - 18));
    }
  }

  @override
  bool shouldRepaint(covariant _LineChartPainter old) =>
      old.progress != progress || old.trend != trend;
}

class _RingPainter extends CustomPainter {
  _RingPainter({
    required this.delivered,
    required this.read,
    required this.failed,
    required this.total,
    required this.progress,
  });
  final int delivered, read, failed, total;
  final double progress;

  @override
  void paint(Canvas canvas, Size size) {
    final center = size.center(Offset.zero);
    final radius = math.min(size.width, size.height) / 2 - 8;
    final background = Paint()
      ..color = const Color(0xFFE8EEF5)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 12;
    canvas.drawCircle(center, radius, background);
    var start = -math.pi / 2;
    final values = <int>[delivered, read, failed];
    final colors = <Color>[
      BusinessColors.green,
      const Color(0xFF2F80ED),
      Colors.redAccent,
    ];
    for (int i = 0; i < values.length; i++) {
      final sweep = 2 * math.pi * (values[i] / total) * progress;
      if (sweep <= 0) continue;
      canvas.drawArc(
        Rect.fromCircle(center: center, radius: radius),
        start,
        sweep,
        false,
        Paint()
          ..color = colors[i]
          ..style = PaintingStyle.stroke
          ..strokeWidth = 12
          ..strokeCap = StrokeCap.round,
      );
      start += sweep;
    }
  }

  @override
  bool shouldRepaint(covariant _RingPainter old) =>
      old.progress != progress ||
      old.delivered != delivered ||
      old.read != read ||
      old.failed != failed;
}
