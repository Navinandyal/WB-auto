import 'package:flutter_test/flutter_test.dart';
import 'package:greetsync_mobile/core/app_config.dart';
void main(){test('default emulator backend URL is configured',(){expect(AppConfig.apiBaseUrl,contains('3000'));});}
