import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';

Uint8List? decodeDataImage(String? data) {
  final value = (data ?? '').trim();
  if (value.isEmpty) return null;
  final comma = value.indexOf(',');
  if (comma <= 0 || !value.substring(0, comma).toLowerCase().contains(';base64')) {
    return null;
  }
  try {
    return base64Decode(value.substring(comma + 1).replaceAll(RegExp(r'\s'), ''));
  } catch (_) {
    return null;
  }
}

class DataImageAvatar extends StatelessWidget {
  const DataImageAvatar({
    super.key,
    this.data,
    required this.fallbackText,
    this.radius = 24,
    this.backgroundColor,
    this.foregroundColor,
  });

  final String? data;
  final String fallbackText;
  final double radius;
  final Color? backgroundColor;
  final Color? foregroundColor;

  @override
  Widget build(BuildContext context) {
    final bytes = decodeDataImage(data);
    final bg = backgroundColor ?? Theme.of(context).colorScheme.primary.withOpacity(.10);
    final fg = foregroundColor ?? Theme.of(context).colorScheme.primary;
    if (bytes != null && bytes.isNotEmpty) {
      return CircleAvatar(
        radius: radius,
        backgroundColor: bg,
        backgroundImage: MemoryImage(bytes),
      );
    }
    return CircleAvatar(
      radius: radius,
      backgroundColor: bg,
      child: Text(
        fallbackText.isEmpty ? '?' : fallbackText,
        style: TextStyle(fontWeight: FontWeight.w900, color: fg),
      ),
    );
  }
}
