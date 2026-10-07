import '../lib/core/message_status.dart';
void main() {
 var passed=0;
 void check(String status,String expected,[Map<String,String> variables=const{}]) {
  if(messageStatus(status,variables)!=expected)throw StateError('$status must display $expected');passed++;
 }
 for(final status in ['ACCEPTED','SENT','DELIVERED','READ'])check(status,'SENT');
 check('ACCEPTED','PROCESSING',{'__meta_message_status':'unknown'});
 check('ACCEPTED','SENT',{'__meta_message_status':'accepted'});
 check('FAILED','FAILED');check('PROCESSING','PROCESSING');check('SCHEDULED','QUEUE');
 check('SIMULATED','SIMULATED');check('PAUSED','PAUSED');check('CANCELLED','CANCELLED');
 print('PASS: $passed status display checks');
}
