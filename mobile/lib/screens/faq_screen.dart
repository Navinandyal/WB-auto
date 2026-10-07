import 'package:flutter/material.dart';

import '../theme/business_theme.dart';

class FaqScreen extends StatefulWidget {
  const FaqScreen({super.key});
  @override
  State<FaqScreen> createState() => _FaqScreenState();
}

class _FaqScreenState extends State<FaqScreen> with SingleTickerProviderStateMixin {
  late final TabController _tabs;
  String query = '';

  static const data = <String, List<String>>{
    'Getting Started': <String>[
      'What is GreetSync?',
      'What can I do with GreetSync?',
      'Who can use GreetSync?',
      'Is GreetSync suitable for small businesses?',
      'Do I need technical knowledge to use GreetSync?',
      'Do I need a website to use GreetSync?',
      'Do I need a Meta/Facebook account to use GreetSync?',
      'Do I need a Meta Business Portfolio?',
      'Can GreetSync help me create my Meta Business setup?',
    ],
    'WhatsApp Number': <String>[
      'Can I use my existing WhatsApp number with GreetSync?',
      'Can I use my existing WhatsApp Business number?',
      'Can I use a personal WhatsApp number?',
      'Can I use a normal WhatsApp Messenger number directly for automation?',
      'Do I need to buy a new phone number?',
      'Can I use a new SIM that has never been registered on WhatsApp?',
      'Can I change the connected WhatsApp number later?',
      'Can I connect more than one WhatsApp number?',
      'Can two businesses use the same WhatsApp number?',
      'Can one WhatsApp number be connected to multiple GreetSync accounts?',
      'Can I disconnect my WhatsApp number from GreetSync?',
    ],
    'WhatsApp Business App': <String>[
      'Do I need WhatsApp Business to use GreetSync?',
      'Can I continue using WhatsApp Business on my phone after connecting GreetSync?',
      'Will my WhatsApp Business app stop working after connecting GreetSync?',
      'Can I manually chat with customers while GreetSync automation is running?',
      'Can manual chats and automated messages use the same WhatsApp number?',
      'What is WhatsApp Business App Coexistence?',
      'Does GreetSync support WhatsApp Business App Coexistence?',
      'Can I receive customer messages in the WhatsApp Business app after connecting GreetSync?',
      'Can I make WhatsApp calls after connecting GreetSync?',
      'Can I continue using WhatsApp groups?',
      'Can I continue using my WhatsApp Business catalog?',
      'Will my existing chats remain available?',
      'Will connecting GreetSync delete my old WhatsApp chats?',
    ],
    'Personal WhatsApp': <String>[
      'Why can\'t normal WhatsApp Messenger be directly automated?',
      'Can I keep using normal WhatsApp Messenger and automate the same number at the same time?',
      'Can I convert my personal WhatsApp number to WhatsApp Business?',
      'Will I lose my chats when switching from WhatsApp to WhatsApp Business?',
      'Can I switch back to normal WhatsApp later?',
      'Should I use my personal number or a separate business number for GreetSync?',
    ],
    'Facebook / Meta Account': <String>[
      'Why does GreetSync ask me to log in with Facebook/Meta?',
      'Does my Facebook account need to use the same phone number as my WhatsApp number?',
      'Can my Facebook login email be different from my WhatsApp phone number?',
      'What if I don\'t have a Facebook account?',
      'Can I create a Facebook account during onboarding?',
      'Do I need a Facebook Page?',
      'Do I need an Instagram account?',
      'Does GreetSync get access to my personal Facebook profile?',
      'Can GreetSync post anything on my Facebook account?',
      'Why does Meta ask me to give permissions to GreetSync?',
      'Can I revoke GreetSync\'s Meta permissions later?',
    ],
    'Business Portfolio / WABA': <String>[
      'What is a Meta Business Portfolio?',
      'What is a WhatsApp Business Account or WABA?',
      'Do I need to create a WABA manually?',
      'Can GreetSync create or connect a WABA during onboarding?',
      'Who owns my WABA after I connect GreetSync?',
      'Does AIKYAM own my WhatsApp Business Account?',
      'Can I access my WABA directly from Meta?',
      'What happens to my WABA if I stop using GreetSync?',
      'Can I move my WABA to another service provider later?',
    ],
    'Connection & Setup': <String>[
      'How do I connect WhatsApp to GreetSync?',
      'What is Meta Embedded Signup?',
      'How long does WhatsApp connection take?',
      'Will I need an OTP to connect my WhatsApp number?',
      'Where will I receive the OTP?',
      'What happens if I don\'t receive the verification code?',
      'Why is my WhatsApp number not appearing during setup?',
      'Why does Meta say my number is already registered?',
      'Why does my connection fail?',
      'How can I reconnect my WhatsApp account?',
      'Do I need to enter an Access Token manually?',
      'What is a WABA ID?',
      'What is a Phone Number ID?',
      'Do I need to know my WABA ID or Phone Number ID?',
    ],
    'Business Verification': <String>[
      'Is Meta Business Verification compulsory?',
      'Can I start using GreetSync before my business is verified?',
      'What documents does Meta require for business verification?',
      'How long does Meta Business Verification take?',
      'What happens if Meta rejects my verification?',
      'Can a sole proprietorship use GreetSync?',
      'Can an unregistered small business use GreetSync?',
      'Is GST registration compulsory?',
      'Do I need a company registration certificate?',
    ],
    'Messaging Limits': <String>[
      'How many WhatsApp messages can I send through GreetSync?',
      'Does WhatsApp have a daily messaging limit?',
      'What does the 250-message/unique-customer limit mean?',
      'Are messaging limits based on messages or unique customers?',
      'What happens when I reach my messaging limit?',
      'How can my WhatsApp messaging limit increase?',
      'How do I check my current Meta messaging limit?',
      'Is my messaging limit shared between multiple phone numbers?',
      'Does GreetSync set the messaging limit or does Meta?',
      'Can GreetSync increase my Meta messaging limit?',
      'What is the difference between GreetSync package limits and Meta messaging limits?',
    ],
    'Quality & Restrictions': <String>[
      'What is WhatsApp quality rating?',
      'Where can I check my WhatsApp quality rating?',
      'What can cause my WhatsApp quality rating to drop?',
      'What happens if customers block or report my number?',
      'Can WhatsApp restrict my number?',
      'Can Meta suspend my WhatsApp Business Account?',
      'How can I avoid getting my number restricted?',
      'Does GreetSync protect me from WhatsApp policy violations?',
    ],
    '24-Hour Messaging Window': <String>[
      'What is the WhatsApp 24-hour customer service window?',
      'Can I send a normal message after the 24-hour window closes?',
      'Why do I need a template after 24 hours?',
      'Can I reply freely when a customer messages me first?',
      'Does the 24-hour window reset when the customer replies?',
      'Are scheduled messages affected by the 24-hour rule?',
    ],
    'Templates': <String>[
      'What is a WhatsApp message template?',
      'Why do WhatsApp templates require Meta approval?',
      'How do I create a WhatsApp template?',
      'Can I create templates from GreetSync?',
      'How long does Meta take to approve a template?',
      'What happens if my template is rejected?',
      'Can I edit an approved template?',
      'Can I delete templates?',
      'Can I use the same template for multiple customers?',
      'Can I personalize a template with the customer\'s name?',
      'Can templates contain images, videos or documents?',
      'Can I create birthday templates?',
      'Can I create festival greeting templates?',
      'Can I create marketing templates?',
    ],
    'Automation': <String>[
      'What types of automations can I create in GreetSync?',
      'Can I schedule birthday messages automatically?',
      'Can I schedule festival greetings?',
      'Can I schedule a message for a specific date and time?',
      'Can I schedule messages months in advance?',
      'Can I send the same message to multiple contacts?',
      'Can I select multiple customers and send in one action?',
      'Can I personalize the same message for every recipient?',
      'Can I preview a message before scheduling it?',
      'Can I edit an automation after creating it?',
      'Can I cancel a scheduled automation?',
      'Can I run an automation again?',
      'What happens if an automated message fails?',
      'Can GreetSync retry failed messages?',
      'Will automation work if my phone is switched off?',
      'Will automation work if my phone has no internet?',
      'Does WhatsApp Business need to remain open for automation to work?',
      'Does my laptop need to remain switched on?',
    ],
    'Contacts': <String>[
      'How do I add contacts to GreetSync?',
      'Can I import contacts from my phone?',
      'Can I import contacts using Excel?',
      'Can I import contacts using CSV?',
      'How many contacts can I import at once?',
      'Does the phone number need a country code?',
      'What happens if a contact does not use WhatsApp?',
      'Can I create customer groups?',
      'Can one customer belong to multiple groups?',
      'Can I select an entire group for an automation?',
      'Can I edit a customer\'s birthday?',
      'Can I delete imported contacts?',
      'Does deleting a contact from GreetSync delete it from my phone?',
    ],
    'Consent / Opt-in': <String>[
      'Do customers need to give permission before I message them?',
      'What is WhatsApp opt-in?',
      'How can I collect customer consent?',
      'Can I message contacts imported from my phone without consent?',
      'Can I upload purchased customer databases?',
      'Can I send bulk marketing messages to unknown numbers?',
      'What happens if customers opt out?',
      'How should I handle STOP/unsubscribe requests?',
    ],
    'Marketing Messages': <String>[
      'Can I send marketing messages through GreetSync?',
      'Can I send offers and promotions?',
      'Can I send messages to hundreds of customers at once?',
      'Is WhatsApp bulk messaging allowed?',
      'Why are some marketing messages not delivered?',
      'Does Meta limit how many marketing messages a customer can receive?',
      'Can I send the same promotional template every day?',
      'Can I include links in marketing messages?',
      'Can I include product images?',
      'Can I add buttons like Call Now or Visit Website?',
    ],
    'Birthday/Festival Messaging': <String>[
      'Can birthdays be sent automatically every year?',
      'Can I schedule birthday wishes at a fixed time?',
      'Can every customer receive a personalized birthday wish?',
      'Can I attach an image to birthday wishes?',
      'Can I automatically send Diwali, New Year and other festival greetings?',
      'Can different customer groups receive different greetings?',
    ],
    'Message Status': <String>[
      'How do I know whether a message was sent?',
      'Can I see delivered and read status?',
      'What does Queued mean?',
      'What does Sent mean?',
      'What does Delivered mean?',
      'What does Read mean?',
      'What does Failed mean?',
      'Why does a message show Failed?',
      'Can I see the reason a message failed?',
    ],
    'Pricing & Meta Charges': <String>[
      'Is GreetSync free?',
      'What GreetSync packages are available?',
      'What is included in each package?',
      'Are WhatsApp/Meta charges included in the GreetSync subscription?',
      'Does Meta charge separately for WhatsApp messages?',
      'Who pays Meta\'s WhatsApp charges?',
      'Why does Meta ask me to add a payment method?',
      'Can I use GreetSync without adding a payment method to Meta?',
      'Does AIKYAM receive my WhatsApp message payment?',
      'What happens if my Meta payment fails?',
      'Will my automation stop if my GreetSync subscription expires?',
      'What happens when my GreetSync message/package limit is exhausted?',
    ],
    'Packages': <String>[
      'How many messages are included in my GreetSync package?',
      'Is the package limit daily or monthly?',
      'Can I upgrade my package?',
      'Can I downgrade my package?',
      'Can I purchase a 1-month, 3-month, 6-month or yearly package?',
      'What happens to unused messages?',
      'Can I purchase additional messages?',
    ],
    'Security & Privacy': <String>[
      'Is it safe to connect my WhatsApp account to GreetSync?',
      'Does GreetSync read my personal WhatsApp conversations?',
      'Can GreetSync access all messages on my phone?',
      'Does GreetSync store my WhatsApp messages?',
      'Where are my customer contacts stored?',
      'Are Meta access tokens securely stored?',
      'Can AIKYAM employees see my Meta password?',
      'Does GreetSync ever receive my Facebook password?',
      'Does GreetSync share customer information with other businesses?',
      'How is my business data protected?',
    ],
    'Account Management': <String>[
      'Can multiple employees use one GreetSync business account?',
      'Can I change my business information?',
      'Can I change my password?',
      'What should I do if I forget my password?',
      'Can I permanently delete my GreetSync account?',
      'What happens to my data after account deletion?',
      'How long is my data retained after deletion?',
      'Can I download/export my data before deleting my account?',
    ],
    'Admin / Approval': <String>[
      'Why does my GreetSync account need admin approval?',
      'How long does account approval take?',
      'What happens if my account is rejected?',
      'Can GreetSync suspend a business account?',
    ],
    'Multiple Businesses': <String>[
      'Can I manage multiple businesses using GreetSync?',
      'Does every business need its own Meta Business Portfolio?',
      'Does every business need its own WABA?',
      'Can one owner connect multiple businesses?',
      'Are customer contacts separated between businesses?',
      'Can one business see another business\'s contacts or automations?',
    ],
    'Facebook Ownership': <String>[
      'Does GreetSync add my WhatsApp number to AIKYAM\'s Meta account?',
      'Will AIKYAM become the owner of my WhatsApp number?',
      'Who owns my WhatsApp Business assets after onboarding?',
      'If I leave GreetSync, can I keep my WhatsApp number and WABA?',
    ],
    'Changing Provider': <String>[
      'Can I move from another WhatsApp API provider to GreetSync?',
      'Can I migrate my existing WABA to GreetSync?',
      'Can I move from GreetSync to another provider later?',
      'Will I lose approved templates during migration?',
      'Will my WhatsApp number change during migration?',
    ],
    'Troubleshooting': <String>[
      'Why is my WhatsApp number disconnected?',
      'Why are my templates not appearing in GreetSync?',
      'Why is my scheduled message not being sent?',
      'Why is a template approved in Meta but not visible in GreetSync?',
      'Why is my number showing Pending?',
      'Why is Meta asking me to verify my business?',
      'Why can\'t I send marketing messages?',
      'Why was my message rejected by Meta?',
      'What should I do if my WABA is disabled?',
      'What should I do if my Facebook/Meta account is locked?',
    ],
    'Phone / Device': <String>[
      'Do I need Android or iPhone to use GreetSync?',
      'Can GreetSync be used from multiple devices?',
      'Can I change my phone after connecting WhatsApp?',
      'Will changing my mobile phone affect automation?',
      'What happens if I lose my phone or SIM?',
    ],
    'Internet / Availability': <String>[
      'Does my phone need to stay connected to the internet?',
      'Will scheduled messages send if my phone is switched off?',
      'Will scheduled messages send if the WhatsApp Business app is closed?',
      'Does GreetSync automation run from the cloud?',
    ],
    'Support': <String>[
      'How do I contact GreetSync support?',
      'What information should I provide when reporting a problem?',
      'Can GreetSync help with Meta verification?',
      'Can GreetSync help if Meta rejects my template?',
      'Can GreetSync help if my WhatsApp number gets restricted?',
    ],
    'Before Connecting WhatsApp': <String>[
      'What should I check before connecting my WhatsApp number?',
      'Should I back up my WhatsApp chats before connecting?',
      'Should I verify my Meta Business Portfolio first?',
      'Should I add a payment method before connecting?',
      'What documents should I keep ready?',
    ],
    'Very Common Sales Questions': <String>[
      'Will I lose my WhatsApp Business account after connecting GreetSync?',
      'Can I continue chatting manually with customers?',
      'Will customers know that messages are automated?',
      'Will customers need to install GreetSync?',
      'Do my customers need to save my number?',
      'Can customers reply to automated messages?',
      'Where will customer replies come?',
      'Can my staff respond to replies normally?',
      'Will automated messages be sent from my own business number?',
      'Can GreetSync send messages when nobody is in the office?',
      'Can I stop automation anytime?',
    ],
  };

  static String _answerFor(String category, String question) {
    final q = question.toLowerCase();

    // Product / setup basics
    if (q == 'what is greetsync?') return 'GreetSync is AIKYAM AI Systems’ WhatsApp Business automation platform for approved template messaging, birthdays, festival greetings, scheduled campaigns, contacts, groups and message tracking.';
    if (q.contains('what can i do with greetsync')) return 'You can connect a WhatsApp Business account, manage contacts and groups, sync or create Meta-approved templates, schedule personalized messages, run birthday/festival automations and track message status.';
    if (q.contains('who can use greetsync')) return 'GreetSync is intended for businesses and organizations that use WhatsApp Business and have permission to message their customers.';
    if (q.contains('suitable for small businesses')) return 'Yes. GreetSync is designed to support small businesses as well as larger teams, subject to your GreetSync package and Meta messaging limits.';
    if (q.contains('technical knowledge')) return 'No coding is required for normal use. Meta account setup and business verification may still require following the guided onboarding steps.';
    if (q.contains('need a website')) return 'No. A website is not required to use GreetSync, although Meta may request business information during verification and some template buttons can link to a website.';
    if (q.contains('need a meta') || q.contains('need facebook')) return 'Yes, connecting the WhatsApp Business Platform normally requires a Meta account with access to the relevant business assets.';
    if (q.contains('meta business portfolio')) return 'A Meta Business Portfolio is the Meta container that owns or manages business assets such as your WhatsApp Business Account. GreetSync can guide you through connecting or creating the required setup through Meta Embedded Signup.';

    // Number / app coexistence
    if (q.contains('existing whatsapp business number')) return 'Usually yes, if the number is eligible for the WhatsApp Business Platform and Meta allows it to be connected or migrated. Eligibility depends on the current number setup and Meta account.';
    if (q.contains('existing whatsapp number')) return 'You can use an eligible existing business number. A normal personal WhatsApp Messenger number cannot be automated directly without moving it to a supported WhatsApp Business setup.';
    if (q.contains('personal whatsapp number') || q.contains('normal whatsapp messenger')) return 'Normal WhatsApp Messenger is not a Cloud API automation endpoint. Use an eligible WhatsApp Business number and complete Meta onboarding before automating it.';
    if (q.contains('buy a new phone number') || q.contains('new sim')) return 'A new number is optional. You may use an eligible existing business number or a new number that can receive the required verification code.';
    if (q.contains('same whatsapp number') && q.contains('two businesses')) return 'No. A WhatsApp business phone number should belong to one business setup at a time so ownership, billing, templates and messaging remain isolated.';
    if (q.contains('disconnect my whatsapp')) return 'Yes. You can disconnect GreetSync from your business account. Your Meta-owned WhatsApp assets remain under your Meta business ownership.';
    if (q.contains('coexistence')) return 'WhatsApp Business App Coexistence is Meta’s supported setup that can allow a business number to keep using the WhatsApp Business app while also using Cloud API features, where Meta makes the feature available for that account and number.';
    if (q.contains('manually chat') || q.contains('manual chats and automated')) return 'Yes when your connected setup supports normal business conversations. GreetSync automation and staff replies are separate actions, but all messaging remains subject to Meta policies and the 24-hour customer service window.';
    if (q.contains('old whatsapp chats') || q.contains('existing chats')) return 'Connecting GreetSync does not intentionally delete your local chat history. If you migrate a number between WhatsApp products, follow Meta’s migration guidance and back up important chats first.';
    if (q.contains('whatsapp calls') || q.contains('make whatsapp calls')) return 'Calling availability depends on your WhatsApp Business/Cloud API configuration and Meta’s calling availability for your account and country. GreetSync does not override Meta calling restrictions.';
    if (q.contains('whatsapp groups')) return 'WhatsApp Cloud API automation is designed for individual business messaging, not automating consumer WhatsApp groups. GreetSync groups are internal contact groups for selecting recipients.';
    if (q.contains('catalog')) return 'If your Meta WhatsApp business setup has a supported catalog, it remains managed in Meta. Template/catalog features are only available when supported by your connected account.';

    // Meta account / WABA
    if (q.contains('why does greetsync ask me to log in with facebook')) return 'Meta login is used to authorize access to the WhatsApp business assets you choose during Embedded Signup. GreetSync does not need your Facebook password.';
    if (q.contains('same phone number as my whatsapp') || q.contains('login email be different')) return 'Your Facebook/Meta login details do not have to match the WhatsApp business phone number. What matters is that the Meta account has permission to manage the correct business assets.';
    if (q.contains('facebook page') || q.contains('instagram account')) return 'A Facebook Page or Instagram account is not required for the core GreetSync WhatsApp automation flow unless Meta specifically requires one for another business feature you choose to use.';
    if (q.contains('personal facebook profile') || q.contains('post anything on my facebook')) return 'GreetSync only receives the permissions and business asset information authorized through Meta. It does not use your Meta login to post to your personal profile.';
    if (q.contains('revoke') && q.contains('meta')) return 'Yes. You can manage or revoke app/business permissions from Meta settings. Revoking required permissions can disconnect WhatsApp features in GreetSync.';
    if (q.contains('what is a whatsapp business account') || q.contains('what is a waba')) return 'A WABA is the WhatsApp Business Account in Meta that contains business phone numbers, templates and messaging configuration used by the WhatsApp Business Platform.';
    if (q.contains('who owns my waba') || q.contains('does aikyam own')) return 'Your business should own or control its Meta/WABA assets. GreetSync connects to those assets with authorized permissions; AIKYAM does not need to become the owner of your WABA.';
    if (q.contains('move my waba') || q.contains('another service provider')) return 'Meta provides supported migration/provider-change processes. Eligibility and steps depend on the current WABA, number and provider configuration.';

    // Connection and verification
    if (q.contains('how do i connect whatsapp')) return 'Open WhatsApp Configuration in GreetSync and complete Meta Embedded Signup. Select or create the correct Meta business, WABA and phone number, complete verification, then let GreetSync sync the account details.';
    if (q.contains('what is meta embedded signup')) return 'Meta Embedded Signup is Meta’s official onboarding flow that lets a business authorize an app and connect or create the required WhatsApp Business assets.';
    if (q.contains('how long does whatsapp connection take')) return 'The connection flow itself can take only a few minutes when your Meta assets and number are ready. Business verification, number issues or Meta review can take longer.';
    if (q.contains('otp') || q.contains('verification code')) return 'Meta may require a verification code when registering or migrating a phone number. The code is delivered using the verification method Meta offers for that number.';
    if (q.contains('number is already registered')) return 'The number is already attached to another WhatsApp setup. Use Meta’s supported migration/coexistence path or disconnect it from the previous setup before trying again.';
    if (q.contains('access token manually')) return 'With a successful Embedded Signup flow, GreetSync should obtain and store the required connection information without asking a normal business user to manually manage tokens.';
    if (q.contains('waba id')) return 'The WABA ID uniquely identifies your WhatsApp Business Account in Meta. GreetSync uses it for template and account operations.';
    if (q.contains('phone number id')) return 'The Phone Number ID is Meta’s identifier for the connected WhatsApp business phone number. It is used when sending Cloud API messages.';

    // Verification
    if (q.contains('business verification compulsory')) return 'Meta verification requirements depend on the features, account state and messaging access requested. Meta may require business verification before higher-trust or production capabilities are available.';
    if (q.contains('documents does meta require')) return 'Meta determines the accepted documents for your country and business type. Use the document list shown in your Meta Business verification flow because requirements can change.';
    if (q.contains('sole proprietorship')) return 'Yes, a sole proprietorship can use GreetSync when it can complete the Meta onboarding requirements applicable to that business.';
    if (q.contains('gst registration compulsory')) return 'GreetSync does not require GST simply to create an account. Meta verification or local billing/compliance requirements may differ depending on the business and country.';

    // Limits / quality
    if (q.contains('how many whatsapp messages')) return 'Your usable volume is constrained by both your GreetSync package quota and any current Meta messaging limits. GreetSync shows your package usage; check WhatsApp Manager for Meta-side limits.';
    if (q.contains('250-message') || q.contains('unique-customer')) return 'Meta’s limits can change by account and product. Treat any fixed number shown in older guidance as account-specific or historical and check the current limit shown in WhatsApp Manager for your phone number.';
    if (q.contains('daily messaging limit')) return 'Meta may apply messaging limits and quality-based restrictions to business-initiated conversations. The current value for your account should be checked in WhatsApp Manager.';
    if (q.contains('reach my messaging limit')) return 'GreetSync blocks sends that exceed your GreetSync package quota. If Meta blocks a send because of a Meta-side limit, the message will fail and the Meta error is recorded.';
    if (q.contains('quality rating')) return 'WhatsApp quality rating reflects recent recipient feedback and message quality for a business phone number. Check the phone number details in WhatsApp Manager for the current rating.';
    if (q.contains('block or report')) return 'Blocks, reports and poor engagement can reduce message quality and may lead to restrictions. Send only relevant, expected messages to opted-in recipients.';
    if (q.contains('avoid getting my number restricted')) return 'Use valid opt-in, send relevant content, respect opt-outs, use the correct template category and avoid purchased or unsolicited contact lists.';
    if (q.contains('protect me from whatsapp policy violations')) return 'GreetSync can enforce app-side checks, but Meta makes the final policy and enforcement decisions. You remain responsible for compliant messaging and valid customer consent.';

    // 24 hour
    if (q.contains('24-hour')) return 'The customer service window begins or refreshes when a customer messages the business. During the open window, supported free-form replies may be sent; outside it, business-initiated messages generally require an approved template.';
    if (q.contains('normal message after')) return 'Outside the customer service window, use an approved WhatsApp template for a business-initiated message.';
    if (q.contains('customer messages me first')) return 'When the customer opens the service window by messaging you, supported free-form customer-service replies can be sent within that window.';

    // Templates
    if (q.contains('what is a whatsapp message template')) return 'A message template is a reusable message structure reviewed by Meta for business-initiated WhatsApp messaging. It can include body text, optional header/footer, variables and supported buttons.';
    if (q.contains('why do whatsapp templates require meta approval')) return 'Meta reviews templates for formatting, category and policy compliance before they can be used for business-initiated messaging.';
    if (q.contains('how do i create a whatsapp template') || q.contains('create templates from greetsync')) return 'Open Message Templates in GreetSync, choose Marketing or Utility, build the message, add required variable samples/buttons, and submit it. GreetSync sends the template to the connected WABA for Meta review.';
    if (q.contains('how long does meta take to approve')) return 'Meta often reviews templates quickly, but review time can vary. Keep the template in Pending until Meta returns an updated status.';
    if (q.contains('template is rejected')) return 'Open the rejected template, review the Meta error/rejection reason, correct the content or structure, and submit a revised version.';
    if (q.contains('edit an approved template')) return 'No in-place editing is allowed in GreetSync for an approved template. Duplicate it, modify the copy and submit the new version for Meta review.';
    if (q.contains('delete templates')) return 'Yes. GreetSync can delete a local draft or request deletion of a Meta-backed template from the connected WABA, then remove the local record after a successful delete.';
    if (q.contains('personalize a template')) return 'Yes. Add variables such as {{1}} or a named field in the builder. During automation, GreetSync asks for the required values and can map the recipient name dynamically.';
    if (q.contains('images, videos or documents')) return 'Yes, supported media can be used as a template header. A review sample must be provided when creating the template, and the actual media requirements depend on the approved template.';
    if (q.contains('birthday templates') || q.contains('festival greeting') || q.contains('marketing templates')) return 'Yes. Create the appropriate Marketing or Utility template, submit it to Meta, and use it only after the connected account shows APPROVED status.';

    // Automation
    if (q.contains('what types of automations')) return 'GreetSync supports scheduled approved-template sends, bulk sends, birthday-related scheduling, festival/campaign messaging and recipient-group selection, subject to package and Meta limits.';
    if (q.contains('schedule birthday') || q.contains('schedule festival') || q.contains('specific date and time') || q.contains('months in advance')) return 'Yes. Select an approved template and eligible contacts, choose the schedule time, review personalized variables, and create the automation.';
    if (q.contains('same message to multiple') || q.contains('multiple customers')) return 'Yes. Use Bulk mode or a GreetSync group. GreetSync creates recipient-specific sends from the same approved template.';
    if (q.contains('personalize the same message')) return 'Yes. Template variables are resolved per recipient. For example, {{1}} can be mapped to each contact’s name so every recipient receives a personalized message.';
    if (q.contains('preview a message')) return 'Yes. GreetSync shows a rendered template preview before scheduling, including the variable values required by the selected template.';
    if (q.contains('cancel a scheduled automation')) return 'Yes, while the automation is still in a cancellable scheduled state. Sent or processing messages cannot be cancelled retroactively.';
    if (q.contains('automated message fails')) return 'The message is marked Failed and the available Meta/API error is recorded so you can identify the cause.';
    if (q.contains('phone is switched off') || q.contains('phone has no internet') || q.contains('whatsapp business need to remain open') || q.contains('laptop need')) return 'Scheduled sends run from the deployed GreetSync backend, so your phone, WhatsApp Business app and laptop do not need to stay open for the cloud automation to execute.';

    // Contacts / consent
    if (q.contains('how do i add contacts')) return 'Add a contact manually, import from phone contacts, import CSV/Excel, or organize existing GreetSync contacts into groups.';
    if (q.contains('import contacts from my phone')) return 'Yes. Allow contact permission, select one or multiple phone contacts and import them into GreetSync.';
    if (q.contains('import contacts using excel') || q.contains('import contacts using csv')) return 'Yes. Use Contacts → Add → Import CSV/Excel. Name and phone are mandatory and the current file limit is 10,000 rows.';
    if (q.contains('how many contacts can i import')) return 'A single CSV or Excel import is limited to 10,000 rows, and your active GreetSync package may impose an additional contact limit.';
    if (q.contains('country code')) return 'Yes. Store phone numbers in international format with country code so WhatsApp can identify the recipient correctly.';
    if (q.contains('customer groups')) return 'Yes. Create GreetSync groups and add contacts to one or more groups for easier audience selection.';
    if (q.contains('deleting a contact') && q.contains('phone')) return 'No. Deleting a GreetSync contact removes it from GreetSync only; it does not delete the contact from your device address book.';
    if (q.contains('permission before i message') || q.contains('what is whatsapp opt-in')) return 'Yes. WhatsApp opt-in means the customer has knowingly agreed to receive messages from your business on WhatsApp. Keep evidence of consent and respect opt-outs.';
    if (q.contains('purchased customer databases') || q.contains('unknown numbers')) return 'Do not use purchased or unsolicited contact lists. Message only recipients for whom your business has a valid WhatsApp opt-in and a legitimate messaging purpose.';
    if (q.contains('stop/unsubscribe')) return 'Treat an opt-out request promptly: stop marketing sends to that contact and update your consent records according to your business process and applicable law.';

    // Pricing / packages
    if (q.contains('is greetsync free')) return 'Availability depends on the packages configured by the GreetSync administrator. Check Billing & Packages for the plans currently offered to your account.';
    if (q.contains('meta charge') || q.contains('whatsapp/meta charges') || q.contains('payment method')) return 'GreetSync subscription fees and Meta WhatsApp charges are separate unless your commercial agreement explicitly says otherwise. Meta bills WhatsApp usage according to the payment setup on the connected Meta business account.';
    if (q.contains('package limit') || q.contains('messages are included') || q.contains('unused messages') || q.contains('additional messages')) return 'GreetSync package quotas are controlled by the active subscription and any message add-ons. Billing & Packages shows the current allowance, usage and remaining quota.';
    if (q.contains('upgrade') || q.contains('downgrade')) return 'Use Billing & Packages to request an available package change. Activation rules depend on the plans configured by the GreetSync administrator.';

    // Security/account
    if (q.contains('safe to connect')) return 'GreetSync uses Meta-authorized APIs and stores required credentials server-side. Use strong account security and only authorize the Meta business assets you intend to connect.';
    if (q.contains('personal whatsapp conversations') || q.contains('all messages on my phone')) return 'No. GreetSync does not read the consumer WhatsApp database on your phone. It processes the WhatsApp Business Platform data and events delivered to the connected business integration.';
    if (q.contains('meta password') || q.contains('facebook password')) return 'No. Your Meta password is entered on Meta’s own login flow and is not provided to GreetSync.';
    if (q.contains('share customer information with other businesses')) return 'Business data is tenant-isolated in GreetSync. One business account should not be able to view another business’s contacts or automations.';
    if (q.contains('delete my greetsync account')) return 'Use the account deletion option in the app. The deletion flow explains the retention period and requires confirmation before the account is removed according to GreetSync policy.';
    if (q.contains('data retained after deletion')) return 'GreetSync’s current account-deletion policy states that deleted account data may be retained for up to 30 days before final removal, subject to legal or security obligations.';

    // Admin / multiple business / ownership / support
    if (q.contains('need admin approval')) return 'Business registration can require GreetSync administrator approval before full access is enabled. This helps control access and package activation.';
    if (q.contains('multiple businesses')) return 'Each business should use its own isolated GreetSync business account and Meta/WhatsApp assets. This keeps contacts, templates, automations and billing separated.';
    if (q.contains('aikyam become the owner') || q.contains('add my whatsapp number to aikyam')) return 'No. The intended setup keeps the business’s WhatsApp assets in its own Meta business ownership and authorizes GreetSync to use the permitted APIs.';
    if (q.contains('move from another whatsapp api provider') || q.contains('migrate my existing waba')) return 'Migration is possible only through Meta-supported provider/number migration procedures. Check the current eligibility of the number and WABA before starting.';
    if (q.contains('contact greetsync support')) return 'Use the support/contact information provided in the GreetSync app or AIKYAM website and include the business name, affected screen, time of issue and any Meta error code.';
    if (q.contains('what information should i provide')) return 'Share the screen/feature, exact steps, expected vs actual result, time of occurrence, affected contact/template/automation ID if available, and any Meta/API error code. Never send passwords or full access tokens.';

    // Troubleshooting
    if (q.contains('templates not appearing') || q.contains('approved in meta but not visible')) return 'Confirm the correct WABA is connected, then use Sync from Meta. Only templates belonging to that connected business account should appear as approved in GreetSync.';
    if (q.contains('scheduled message not being sent')) return 'Check that the package is active, the recipient has opt-in, the template is still approved, the schedule is in the future, WhatsApp credentials are connected, and the message/automation history for the exact Meta error.';
    if (q.contains('number showing pending')) return 'A Pending state usually means Meta onboarding, number registration, template review or another account action has not completed. Open the relevant Meta/GreetSync status screen for the current reason.';
    if (q.contains('waba is disabled') || q.contains('account is locked')) return 'Resolve the restriction in Meta first. GreetSync cannot bypass Meta account enforcement or restore access that Meta has disabled.';

    // Device / availability / sales basics
    if (q.contains('android or iphone')) return 'GreetSync mobile support depends on the released app platforms. The current project is built for Android; other clients may be provided separately.';
    if (q.contains('multiple devices')) return 'You can sign in on supported devices according to GreetSync session/security rules. WhatsApp automation itself runs from the backend, not from one specific phone.';
    if (q.contains('customers need to install greetsync')) return 'No. Customers receive normal WhatsApp messages from your connected business number and do not need GreetSync.';
    if (q.contains('customers reply')) return 'Yes. Customer replies arrive through the connected WhatsApp business setup and can be handled according to the tools available to your business account.';
    if (q.contains('customers know that messages are automated')) return 'WhatsApp displays the message as coming from your business number. Whether you disclose automation in the wording depends on your business policy and applicable requirements.';
    if (q.contains('send messages when nobody is in the office')) return 'Yes. Scheduled backend automation can run without a staff member keeping the phone or laptop open.';
    if (q.contains('stop automation anytime')) return 'You can cancel or pause eligible scheduled automations before they are sent.';

    // Category-aware fallback: every FAQ still gets an actual answer instead of a blank card.
    switch (category) {
      case 'Templates':
        return 'This is controlled by the connected Meta WhatsApp Business Account. Use GreetSync Message Templates to create/sync templates, and rely on the current Meta review status before sending.';
      case 'Automation':
        return 'GreetSync automations use approved WhatsApp templates, eligible opted-in contacts, your selected schedule and your active package limits. Review the automation before saving and check message history for delivery status.';
      case 'Contacts':
      case 'Consent / Opt-in':
        return 'Manage this from the Contacts area. Keep accurate contact details, use international phone numbers, obtain valid WhatsApp opt-in and respect customer opt-out requests.';
      case 'Pricing & Meta Charges':
      case 'Packages':
        return 'Check Billing & Packages for GreetSync subscription limits. Meta WhatsApp usage and billing rules are separate and are controlled by the connected Meta business account.';
      case 'Security & Privacy':
        return 'GreetSync uses only the business data and permissions needed for the connected features. Do not share passwords or raw access tokens, and use the Privacy Policy for the complete data-handling terms.';
      case 'Troubleshooting':
        return 'Check the relevant connection, template, contact and message status first. If the issue persists, capture the exact error code and contact GreetSync support with reproduction steps.';
      default:
        return 'This feature follows the configuration of your GreetSync account and the connected Meta WhatsApp Business Account. Open the relevant screen to see the current account-specific status and available actions.';
    }
  }

  @override
  void initState() {
    super.initState();
    _tabs = TabController(length: data.length, vsync: this);
  }

  @override
  void dispose() {
    _tabs.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final categories = data.keys.toList();
    return Scaffold(
      appBar: AppBar(
        title: const Text('Frequently Asked Questions'),
        bottom: TabBar(
          controller: _tabs,
          isScrollable: true,
          tabs: categories.map((e) => Tab(text: e)).toList(),
        ),
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(14),
            child: TextField(
              onChanged: (v) => setState(() => query = v.trim().toLowerCase()),
              decoration: const InputDecoration(
                prefixIcon: Icon(Icons.search_rounded),
                hintText: 'Search FAQ questions',
              ),
            ),
          ),
          Expanded(
            child: TabBarView(
              controller: _tabs,
              children: categories.map((category) {
                final items = data[category]!
                    .where((q) => query.isEmpty || q.toLowerCase().contains(query))
                    .toList();
                if (items.isEmpty) return const Center(child: Text('No matching questions.'));
                return ListView.separated(
                  padding: const EdgeInsets.fromLTRB(14, 4, 14, 30),
                  itemCount: items.length,
                  separatorBuilder: (_, __) => const SizedBox(height: 8),
                  itemBuilder: (_, i) {
                    final question = items[i];
                    final answer = _answerFor(category, question);
                    return Card(
                      child: ExpansionTile(
                        leading: const Icon(Icons.help_outline_rounded, color: BusinessColors.green),
                        title: Text(question, style: const TextStyle(fontWeight: FontWeight.w800)),
                        childrenPadding: const EdgeInsets.fromLTRB(18, 0, 18, 16),
                        expandedCrossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Divider(height: 1),
                          const SizedBox(height: 12),
                          Text(answer, style: const TextStyle(height: 1.45, color: BusinessColors.muted)),
                        ],
                      ),
                    );
                  },
                );
              }).toList(),
            ),
          ),
        ],
      ),
    );
  }
}
