package com.aikyam.whatsappautomation

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class ScheduledNotificationReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val id = intent.getIntExtra("id", 0)
        val title = intent.getStringExtra("title") ?: "Scheduled message"
        val body = intent.getStringExtra("body") ?: "A GreetSync scheduled message is due now."
        NotificationHelper.show(context, id, title, body)
    }
}
