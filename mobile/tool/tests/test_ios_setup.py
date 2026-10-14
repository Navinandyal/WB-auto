"""Portable setup guard regressions; no Apple account or Xcode required."""
import base64
import json
import plistlib
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from ios_configure import configure, export_options, validate_url
from ios_validate_build import verify

SOURCE = Path(__file__).resolve().parents[2]

class IOSSetupTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='GreetSync Mac spaces ')
        self.mobile = Path(self.temp.name) / 'mobile app'
        ios = self.mobile / 'ios'
        (ios / 'Flutter').mkdir(parents=True)
        (ios / 'Runner').mkdir()
        for filename in ['Info.plist', 'Info-Debug.plist']:
            shutil.copyfile(SOURCE / 'ios/Runner' / filename, ios / 'Runner' / filename)
        self.env = {'SRCROOT': str(ios), 'CONFIGURATION': 'Debug',
                    'PRODUCT_BUNDLE_IDENTIFIER': 'com.example.greetsync',
                    'DART_DEFINES': self.encode('https://api.example.com'),
                    'CODE_SIGN_ENTITLEMENTS': 'Runner/Runner.entitlements'}
    def tearDown(self):
        self.temp.cleanup()
    @staticmethod
    def encode(url):
        return base64.b64encode(('API_BASE_URL=' + url).encode()).decode()
    def setup(self, **kwargs):
        return configure(kwargs.pop('api_url', 'https://api.example.com'),
                         'com.example.greetsync', mobile=self.mobile, **kwargs)
    def firebase(self, bundle='com.example.greetsync'):
        path = self.mobile / 'ios/Runner/GoogleService-Info.plist'
        path.write_bytes(plistlib.dumps({'BUNDLE_ID': bundle, 'GOOGLE_APP_ID': '1:123:ios:test',
                                        'API_KEY': 'fixture', 'PROJECT_ID': 'fixture', 'GCM_SENDER_ID': '123'}))
    def test_https_and_folder_spaces(self):
        settings = self.setup()
        self.assertEqual(settings['apiUrl'], verify(self.env))
        self.assertIn(self.encode(settings['apiUrl']), (self.mobile/'ios/Flutter/GreetSync.xcconfig').read_text())
    def test_reject_unsafe_or_wrong_origins(self):
        for url in ['http://host', 'https://host/api', 'https://a:b@host', 'https://host?q=x',
                    'https://host#x', 'https://host:99999', 'https://host\n', 'file:///tmp/app']:
            with self.subTest(url=url), self.assertRaises(ValueError): validate_url(url)
    def test_local_http_only_debug(self):
        self.setup(api_url='http://192.168.1.10:3000', local_development=True)
        self.env.update(DART_DEFINES=self.encode('http://192.168.1.10:3000'), GREETSYNC_BACKEND_MODE='local')
        self.assertEqual('http://192.168.1.10:3000', verify(self.env))
        for mode in ['Release', 'Profile']:
            self.env['CONFIGURATION'] = mode
            with self.assertRaises(ValueError): verify(self.env)
        debug = plistlib.loads((self.mobile/'ios/Runner/Info-Debug.plist').read_bytes())
        release = plistlib.loads((self.mobile/'ios/Runner/Info.plist').read_bytes())
        self.assertTrue(debug['NSAppTransportSecurity']['NSAllowsArbitraryLoads'])
        self.assertNotIn('NSAllowsArbitraryLoads', release['NSAppTransportSecurity'])
        with self.assertRaises(ValueError): export_options('development', self.mobile)
    def test_reconfigure_clears_debug_exception_and_push(self):
        self.firebase()
        self.setup(team_id='AB12CD34EF', push=True, local_development=True, api_url='http://192.168.1.10:3000')
        self.setup()
        for file in ['Info.plist', 'Info-Debug.plist']:
            data=plistlib.loads((self.mobile/'ios/Runner'/file).read_bytes())
            self.assertNotIn('UIBackgroundModes', data)
            self.assertNotIn('NSAllowsArbitraryLoads', data['NSAppTransportSecurity'])
    def test_invalid_bundle_or_team(self):
        for bundle, team in [('greetsync', ''), ('com.example.bad_name', ''), ('com.example.app', 'invalid')]:
            with self.assertRaises(ValueError): configure('https://api.example.com', bundle, team, mobile=self.mobile)
    def test_push_requires_matching_firebase_and_team(self):
        with self.assertRaises(ValueError): self.setup(push=True)
        with self.assertRaises(ValueError): self.setup(push=True, team_id='AB12CD34EF')
        self.firebase('com.example.wrong')
        with self.assertRaises(ValueError): self.setup(push=True, team_id='AB12CD34EF')
        self.firebase()
        self.setup(push=True, team_id='AB12CD34EF')
        data=plistlib.loads((self.mobile/'ios/Runner/Info.plist').read_bytes())
        self.assertIn('remote-notification', data['UIBackgroundModes'])
    def test_build_rejects_missing_invalid_defines(self):
        for definitions in ['', '%%%', base64.b64encode(b'OTHER=hello').decode()]:
            self.env['DART_DEFINES']=definitions
            with self.assertRaises(ValueError): verify(self.env)
    def test_build_rejects_wrong_firebase(self):
        self.firebase('com.example.wrong')
        with self.assertRaises(ValueError): verify(self.env)
    def test_build_rejects_missing_push_config(self):
        self.env['CODE_SIGN_ENTITLEMENTS']='Runner/RunnerPush.entitlements'
        with self.assertRaises(ValueError): verify(self.env)
    def test_export_options_and_push_environment(self):
        self.setup(team_id='AB12CD34EF')
        for choice, method, env in [('development','debugging','development'),
                                   ('ad-hoc','release-testing','production'),
                                   ('app-store','app-store-connect','production')]:
            path=export_options(choice, self.mobile)
            self.assertEqual(method, plistlib.loads(path.read_bytes())['method'])
            self.assertIn('GREETSYNC_PUSH_ENVIRONMENT = ' + env, (self.mobile/'ios/Flutter/GreetSync.xcconfig').read_text())
    def test_export_requires_team(self):
        self.setup()
        with self.assertRaises(ValueError): export_options('development', self.mobile)

if __name__ == '__main__': unittest.main()
