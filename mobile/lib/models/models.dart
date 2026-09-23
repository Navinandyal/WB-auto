int _i(dynamic v, [int d = 0]) => v is int ? v : int.tryParse('$v') ?? d;
bool _b(dynamic v, [bool d = false]) => v is bool ? v : d;
String _s(dynamic v, [String d = '']) => v?.toString() ?? d;

class AppUser {
  AppUser({required this.id, required this.uid, required this.mobile, required this.email, required this.name, required this.role, required this.businessName, required this.approvalStatus});
  final int id;
  final String uid, mobile, email, name, role, businessName, approvalStatus;
  bool get isAdmin => role == 'admin';
  factory AppUser.fromJson(Map<String, dynamic> j) => AppUser(
    id: _i(j['id']),
    uid: _s(j['uid']),
    mobile: _s(j['phone'] ?? j['mobile']),
    email: _s(j['email']),
    name: _s(j['name']),
    role: _s(j['role'], 'business_user'),
    businessName: _s(j['businessName'] ?? j['business_name']),
    approvalStatus: _s(j['approvalStatus'] ?? j['approval_status'], 'ACTIVE'),
  );
}

class BusinessUser {
  BusinessUser({required this.id, required this.uid, required this.mobile, required this.email, required this.name, required this.role, required this.isActive, required this.businessName, required this.businessAddress, required this.approvalStatus, this.createdAt, this.lastLoginAt});
  final int id;
  final String uid, mobile, email, name, role, businessName, businessAddress, approvalStatus;
  final bool isActive;
  final DateTime? createdAt, lastLoginAt;
  bool get isPending => approvalStatus == 'PENDING' || approvalStatus == 'PENDING_APPROVAL';
  bool get isApproved => approvalStatus == 'APPROVED' || approvalStatus == 'ACTIVE';
  bool get isRejected => approvalStatus == 'REJECTED';
  bool get isSuspended => approvalStatus == 'SUSPENDED';
  factory BusinessUser.fromJson(Map<String, dynamic> j) => BusinessUser(
    id: _i(j['id']), uid: _s(j['uid']), mobile: _s(j['phone'] ?? j['mobile']), email: _s(j['email']),
    name: _s(j['name']), role: _s(j['role'], 'business_user'), isActive: _b(j['isActive'] ?? j['is_active'], true),
    businessName: _s(j['businessName'] ?? j['business_name']), businessAddress: _s(j['businessAddress'] ?? j['business_address']),
    approvalStatus: _s(j['approvalStatus'] ?? j['approval_status'], 'PENDING_APPROVAL'),
    createdAt: DateTime.tryParse(_s(j['createdAt'] ?? j['created_at'])),
    lastLoginAt: DateTime.tryParse(_s(j['lastLoginAt'] ?? j['last_login_at'])),
  );
}

class AdminOverview {
  AdminOverview({required this.totalBusinesses, required this.pendingApprovals, required this.totalContacts, required this.totalAutomations, required this.totalMessages});
  final int totalBusinesses, pendingApprovals, totalContacts, totalAutomations, totalMessages;
  factory AdminOverview.fromJson(Map<String,dynamic> j) => AdminOverview(totalBusinesses:_i(j['totalBusinesses']), pendingApprovals:_i(j['pendingApprovals']), totalContacts:_i(j['totalContacts']), totalAutomations:_i(j['totalAutomations']), totalMessages:_i(j['totalMessages']));
}

class Contact {
  Contact({required this.id, required this.name, required this.phone, required this.optIn, this.email, this.dob, required this.birthdayAutomationEnabled, this.notes});
  final int id; final String name, phone; final bool optIn, birthdayAutomationEnabled; final String? email, dob, notes;
  factory Contact.fromJson(Map<String,dynamic> j) => Contact(id:_i(j['id']), name:_s(j['name']), phone:_s(j['phone']), optIn:_b(j['optIn'] ?? j['opt_in'], true), email:j['email']?.toString(), dob:j['dob']?.toString(), birthdayAutomationEnabled:_b(j['birthdayAutomationEnabled'] ?? j['birthday_automation_enabled'], true), notes:j['notes']?.toString());
}

class ContactGroup {
  ContactGroup({required this.id, required this.name, required this.memberCount, this.description});
  final int id, memberCount; final String name; final String? description;
  factory ContactGroup.fromJson(Map<String,dynamic> j) => ContactGroup(id:_i(j['id']), name:_s(j['name']), memberCount:_i(j['memberCount'] ?? j['member_count']), description:j['description']?.toString());
}

class MessageTemplate {
  MessageTemplate({required this.id, required this.name, required this.language, required this.category, required this.status, required this.variableCount, required this.components});
  final int id, variableCount; final String name, language, category, status; final List<dynamic> components;
  factory MessageTemplate.fromJson(Map<String,dynamic> j) => MessageTemplate(id:_i(j['id']), name:_s(j['name']), language:_s(j['language']), category:_s(j['category']), status:_s(j['status']), variableCount:_i(j['variableCount'] ?? j['variable_count']), components:(j['components'] as List?) ?? const []);

  String get bodyText {
    for (final c in components) {
      if (c is Map && _s(c['type']).toUpperCase() == 'BODY') return _s(c['text']);
    }
    return '';
  }
}

class Automation {
  Automation({required this.id, required this.contactId, required this.templateId, required this.variables, required this.scheduledAt, required this.timezone, required this.status, this.executedAt, this.errorMessage, required this.contactName, required this.contactPhone, required this.contactOptIn, required this.templateName, required this.templateLanguage, required this.templateStatus});
  final int id, contactId, templateId; final Map<String,String> variables; final DateTime scheduledAt; final String timezone,status,contactName,contactPhone,templateName,templateLanguage,templateStatus; final DateTime? executedAt; final String? errorMessage; final bool contactOptIn;
  factory Automation.fromJson(Map<String,dynamic> j) => Automation(id:_i(j['id']), contactId:_i(j['contactId']), templateId:_i(j['templateId']), variables:(j['variables'] is Map ? (j['variables'] as Map).map((k,v)=>MapEntry('$k','$v')) : <String,String>{}), scheduledAt:DateTime.tryParse(_s(j['scheduledAt'])) ?? DateTime.now(), timezone:_s(j['timezone'],'Asia/Kolkata'), status:_s(j['status']), executedAt:DateTime.tryParse(_s(j['executedAt'])), errorMessage:j['errorMessage']?.toString(), contactName:_s(j['contactName']), contactPhone:_s(j['contactPhone']), contactOptIn:_b(j['contactOptIn'],true), templateName:_s(j['templateName']), templateLanguage:_s(j['templateLanguage']), templateStatus:_s(j['templateStatus']));
}

class DashboardData {
  DashboardData({required this.configured, required this.connectionStatus, required this.totalContacts, required this.scheduledMessages, required this.messagesSent, required this.failedMessages, required this.upcoming});
  final bool configured; final String connectionStatus; final int totalContacts, scheduledMessages, messagesSent, failedMessages; final List<Automation> upcoming;
  factory DashboardData.fromJson(Map<String,dynamic> j) { final c=(j['connection'] as Map?)?.cast<String,dynamic>() ?? {}; final s=(j['stats'] as Map?)?.cast<String,dynamic>() ?? {}; return DashboardData(configured:_b(c['configured']), connectionStatus:_s(c['status']), totalContacts:_i(s['totalContacts']), scheduledMessages:_i(s['scheduledMessages']), messagesSent:_i(s['messagesSent']), failedMessages:_i(s['failedMessages']), upcoming:((j['upcoming'] as List?)??[]).whereType<Map>().map((e)=>Automation.fromJson(e.cast<String,dynamic>())).toList()); }
}

class BirthdayItem {
  BirthdayItem({required this.contactId,required this.contactName,required this.contactPhone,required this.optIn,required this.dob,required this.ageTurning,required this.daysUntilBirthday,required this.isToday,required this.isThisMonth,required this.nextBirthdayDate,required this.birthdayAutomationEnabled,this.nextScheduledTime,this.automationId,this.automationStatus,this.templateId,this.templateName,this.customMessage});
  final int contactId,ageTurning,daysUntilBirthday; final String contactName,contactPhone,dob,nextBirthdayDate; final bool optIn,isToday,isThisMonth,birthdayAutomationEnabled; final String? nextScheduledTime,automationStatus,templateName,customMessage; final int? automationId,templateId;
  factory BirthdayItem.fromJson(Map<String,dynamic> j)=>BirthdayItem(contactId:_i(j['contactId']),contactName:_s(j['contactName']),contactPhone:_s(j['contactPhone']),optIn:_b(j['optIn']),dob:_s(j['dob']),ageTurning:_i(j['ageTurning']),daysUntilBirthday:_i(j['daysUntilBirthday']),isToday:_b(j['isToday']),isThisMonth:_b(j['isThisMonth']),nextBirthdayDate:_s(j['nextBirthdayDate']),birthdayAutomationEnabled:_b(j['birthdayAutomationEnabled'],true),nextScheduledTime:j['nextScheduledTime']?.toString(),automationId:j['automationId']==null?null:_i(j['automationId']),automationStatus:j['automationStatus']?.toString(),templateId:j['templateId']==null?null:_i(j['templateId']),templateName:j['templateName']?.toString(),customMessage:j['customMessage']?.toString());
}

class BirthdaySettings {
  BirthdaySettings({required this.enabled,required this.defaultSendTime,required this.defaultTemplateId,required this.customMessage,required this.timezone});
  bool enabled; String defaultSendTime,customMessage,timezone; int defaultTemplateId;
  factory BirthdaySettings.fromJson(Map<String,dynamic> j)=>BirthdaySettings(enabled:_b(j['enabled'],true),defaultSendTime:_s(j['defaultSendTime'],'09:00'),defaultTemplateId:_i(j['defaultTemplateId'],1),customMessage:_s(j['customMessage']),timezone:_s(j['timezone'],'Asia/Kolkata'));
  Map<String,dynamic> toJson()=>{'enabled':enabled,'defaultSendTime':defaultSendTime,'defaultTemplateId':defaultTemplateId,'customMessage':customMessage,'timezone':timezone};
}
