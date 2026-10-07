import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'package:url_launcher/url_launcher.dart';

class LocationPickerScreen extends StatefulWidget {
  const LocationPickerScreen({super.key, this.latitude, this.longitude});
  final double? latitude, longitude;
  @override
  State<LocationPickerScreen> createState() => _LocationPickerScreenState();
}

class _LocationPickerScreenState extends State<LocationPickerScreen> {
  final controller = MapController();
  late LatLng point;
  late TextEditingController latitude, longitude;
  bool selected = false;
  @override
  void initState() {
    super.initState();
    point = LatLng(widget.latitude ?? 18.5204, widget.longitude ?? 73.8567);
    selected = widget.latitude != null && widget.longitude != null;
    latitude = TextEditingController(
      text: selected ? point.latitude.toStringAsFixed(7) : '',
    );
    longitude = TextEditingController(
      text: selected ? point.longitude.toStringAsFixed(7) : '',
    );
  }

  @override
  void dispose() {
    latitude.dispose();
    longitude.dispose();
    controller.dispose();
    super.dispose();
  }

  void choose(LatLng p) => setState(() {
    point = p;
    selected = true;
    latitude.text = p.latitude.toStringAsFixed(7);
    longitude.text = p.longitude.toStringAsFixed(7);
  });
  void jump() {
    final lat = double.tryParse(latitude.text),
        lng = double.tryParse(longitude.text);
    if (lat == null ||
        lng == null ||
        !lat.isFinite ||
        !lng.isFinite ||
        lat.abs() > 90 ||
        lng.abs() > 180) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Enter valid latitude and longitude.')),
      );
      return;
    }
    choose(LatLng(lat, lng));
    controller.move(point, 17);
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Choose exact location')),
    body: Column(
      children: [
        const Padding(
          padding: EdgeInsets.all(12),
          child: Text(
            'Zoom in and tap your business or meeting point. Coordinates fill automatically.',
          ),
        ),
        Expanded(
          child: Stack(
            children: [
              FlutterMap(
                mapController: controller,
                options: MapOptions(
                  initialCenter: point,
                  initialZoom: selected ? 17 : 12,
                  minZoom: 2,
                  maxZoom: 19,
                  onTap: (_, p) => choose(p),
                ),
                children: [
                  TileLayer(
                    urlTemplate: const String.fromEnvironment(
                      'MAP_TILE_URL',
                      defaultValue:
                          'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                    ),
                    userAgentPackageName: 'com.aikyam.whatsappautomation',
                    maxNativeZoom: 19,
                  ),
                  if (selected)
                    MarkerLayer(
                      markers: [
                        Marker(
                          point: point,
                          width: 44,
                          height: 44,
                          alignment: Alignment.topCenter,
                          child: const Icon(
                            Icons.location_pin,
                            color: Color(0xFFE94235),
                            size: 44,
                          ),
                        ),
                      ],
                    ),
                  RichAttributionWidget(
                    attributions: [
                      TextSourceAttribution(
                        'OpenStreetMap contributors',
                        onTap: () => launchUrl(
                          Uri.parse('https://www.openstreetmap.org/copyright'),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
              Positioned(
                right: 12,
                top: 12,
                child: Column(
                  children: [
                    FloatingActionButton.small(
                      heroTag: 'mapPlus',
                      onPressed: () => controller.move(
                        controller.camera.center,
                        (controller.camera.zoom + 1)
                            .clamp(2.0, 19.0)
                            .toDouble(),
                      ),
                      child: const Icon(Icons.add),
                    ),
                    const SizedBox(height: 8),
                    FloatingActionButton.small(
                      heroTag: 'mapMinus',
                      onPressed: () => controller.move(
                        controller.camera.center,
                        (controller.camera.zoom - 1)
                            .clamp(2.0, 19.0)
                            .toDouble(),
                      ),
                      child: const Icon(Icons.remove),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
        Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            children: [
              Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: latitude,
                      onChanged: (_) => setState(() => selected = false),
                      keyboardType: const TextInputType.numberWithOptions(
                        decimal: true,
                        signed: true,
                      ),
                      decoration: const InputDecoration(labelText: 'Latitude'),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: TextField(
                      controller: longitude,
                      onChanged: (_) => setState(() => selected = false),
                      keyboardType: const TextInputType.numberWithOptions(
                        decimal: true,
                        signed: true,
                      ),
                      decoration: const InputDecoration(labelText: 'Longitude'),
                    ),
                  ),
                ],
              ),
              Row(
                children: [
                  TextButton.icon(
                    onPressed: jump,
                    icon: const Icon(Icons.my_location),
                    label: const Text('Go to coordinates'),
                  ),
                  const Spacer(),
                  FilledButton(
                    onPressed: selected
                        ? () => Navigator.pop(context, {
                            'latitude': point.latitude,
                            'longitude': point.longitude,
                          })
                        : null,
                    child: const Text('Use location'),
                  ),
                ],
              ),
            ],
          ),
        ),
      ],
    ),
  );
}
