package am.evakuators.offeralert

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.MediaPlayer
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.provider.Settings
import android.view.WindowManager
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import java.lang.ref.WeakReference

/** A button the driver pressed on the offer alarm (or a tap that opened it) */
data class OfferAlarmAction(val offerId: String, val action: String)

/**
 * The offer alarm — an incoming-call style alert for a new order offer
 * (product decision, 2026-11: on a locked phone the offer must RING and come
 * up ON SCREEN).
 *
 * What expo-notifications cannot do, and this does:
 *  - a full-screen intent: with the screen off / phone locked, Android turns
 *    the screen on and opens the app over the lock screen showing the offer
 *    (like an incoming call); while the phone is in use it is a heads-up
 *    notification instead;
 *  - an INSISTENT sound (FLAG_INSISTENT) that loops until the offer is
 *    answered, withdrawn or times out — not one beep;
 *  - the ALARM audio stream (channel audio usage ALARM, category ALARM): the
 *    ringer switch on silent/vibrate does not mute it, and Do Not Disturb's
 *    default "allow alarms" lets it through;
 *  - «Ընդունել» / «Մերժել» buttons that open the app with the answer, which
 *    the JS side sends through its normal idempotent accept/reject.
 *
 * One notification at a time (fixed tag + id): a newer offer replaces an
 * older one, and a repeat push for the same offer updates it without
 * restarting the sound (`setOnlyAlertOnce`).
 *
 * The channel id is NEW (`offer_alarm_v1`): a channel's sound and audio
 * attributes are fixed when it is first created, so changing them means a new id.
 *
 * The ring is the driver's choice (2026-11, «Զանգի ձայն»): one of the files
 * bundled in res/raw (mobile/assets/sounds). As a channel's sound cannot
 * change, every sound has its OWN channel (`offer_alarm_<sound>_v1`; the
 * original sound keeps `offer_alarm_v1`) and the channels of the other sounds
 * are deleted, so the system settings list only the one in use.
 */
object OfferAlarm {
  private const val LEGACY_CHANNEL_ID = "offer_alarm_v1"
  private const val CHANNEL_PREFIX = "offer_alarm_"
  private const val DEFAULT_SOUND = "offer_alert"
  private const val PREFS = "evk_offer_alert"
  private const val PREF_SOUND = "sound"
  private const val PREVIEW_MS = 7_000L
  private const val TAG = "evk-offer-alarm"
  private const val NOTIFICATION_ID = 73401
  private const val EXTRA_OFFER_ID = "am.evakuators.offeralert.OFFER_ID"
  private const val EXTRA_ACTION = "am.evakuators.offeralert.ACTION"
  private const val EXTRA_FULL_SCREEN = "am.evakuators.offeralert.FULL_SCREEN"
  const val ACTION_OPEN = "OPEN"
  const val ACTION_ACCEPT = "ACCEPT"
  const val ACTION_REJECT = "REJECT"
  private val VIBRATION = longArrayOf(0, 800, 400, 800, 400, 800)
  private const val DEFAULT_CHANNEL_NAME = "Նոր պատվերի զանգ"

  @Volatile private var pending: OfferAlarmAction? = null
  @Volatile var onAction: ((OfferAlarmAction) -> Unit)? = null
  @Volatile private var activityRef: WeakReference<Activity>? = null

  // ─── Channel ─────────────────────────────────────────────────────────────

  // ─── Sound ───────────────────────────────────────────────────────────────

  /** The chosen ring: a res/raw name such as "offer_chime" (falls back to the original) */
  fun sound(context: Context): String {
    val saved = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(PREF_SOUND, null)
    return if (saved != null && rawId(context, saved) != 0) saved else DEFAULT_SOUND
  }

  /** Saves the driver's choice; the next alarm rings with it (on its own channel) */
  fun setSound(context: Context, name: String): Boolean {
    if (rawId(context, name) == 0) return false
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(PREF_SOUND, name).apply()
    return true
  }

  fun channelId(context: Context): String {
    val sound = sound(context)
    return if (sound == DEFAULT_SOUND) LEGACY_CHANNEL_ID else "$CHANNEL_PREFIX${sound.removePrefix("offer_")}_v1"
  }

  private fun rawId(context: Context, name: String): Int =
    if (name.matches(Regex("^[a-z0-9_]{1,40}$"))) context.resources.getIdentifier(name, "raw", context.packageName) else 0

  @Volatile private var previewPlayer: MediaPlayer? = null

  /** Plays a ring for a few seconds on the ALARM stream — what the driver will hear */
  fun preview(context: Context, name: String): Boolean {
    stopPreview()
    val id = rawId(context, name)
    if (id == 0) return false
    return try {
      val player = MediaPlayer()
      player.setAudioAttributes(
        AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build(),
      )
      context.resources.openRawResourceFd(id).use { fd -> player.setDataSource(fd.fileDescriptor, fd.startOffset, fd.length) }
      player.setOnCompletionListener { stopPreview() }
      player.prepare()
      player.start()
      previewPlayer = player
      Handler(Looper.getMainLooper()).postDelayed({ if (previewPlayer === player) stopPreview() }, PREVIEW_MS)
      true
    } catch (failed: Exception) {
      false
    }
  }

  fun stopPreview() {
    val player = previewPlayer ?: return
    previewPlayer = null
    try {
      player.stop()
    } catch (ignored: IllegalStateException) {
      // never started
    }
    player.release()
  }

  // ─── Channel ─────────────────────────────────────────────────────────────

  fun ensureChannel(context: Context, name: String?) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    val label = if (name.isNullOrBlank()) DEFAULT_CHANNEL_NAME else name
    val id = channelId(context)
    // The channels of sounds no longer chosen
    for (old in manager.notificationChannels) {
      if (old.id != id && (old.id == LEGACY_CHANNEL_ID || old.id.startsWith(CHANNEL_PREFIX))) manager.deleteNotificationChannel(old.id)
    }
    val existing = manager.getNotificationChannel(id)
    if (existing != null) {
      // Only the name may change after creation; sound and attributes are fixed.
      if (existing.name != label) {
        existing.name = label
        manager.createNotificationChannel(existing)
      }
      return
    }
    val channel = NotificationChannel(id, label, NotificationManager.IMPORTANCE_HIGH).apply {
      setSound(
        soundUri(context),
        AudioAttributes.Builder()
          .setUsage(AudioAttributes.USAGE_ALARM)
          .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
          .build(),
      )
      enableVibration(true)
      vibrationPattern = VIBRATION
      enableLights(true)
      lockscreenVisibility = Notification.VISIBILITY_PUBLIC
      // Honoured only if the user lets the channel override Do Not Disturb
      // (the app links to that setting); asked for here so it is the default
      // wherever the system allows it.
      setBypassDnd(true)
    }
    manager.createNotificationChannel(channel)
  }

  /** The chosen bundled ring (res/raw, from mobile/assets/sounds), else the system alarm sound */
  private fun soundUri(context: Context): Uri {
    val id = rawId(context, sound(context))
    return if (id != 0) Uri.parse("android.resource://${context.packageName}/$id") else RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
  }

  private fun smallIcon(context: Context): Int {
    val custom = context.resources.getIdentifier("notification_icon", "drawable", context.packageName)
    return if (custom != 0) custom else context.applicationInfo.icon
  }

  // ─── The alarm ───────────────────────────────────────────────────────────

  @SuppressLint("MissingPermission")
  fun show(
    context: Context,
    offerId: String,
    title: String,
    body: String,
    acceptLabel: String,
    rejectLabel: String,
    channelName: String?,
    timeoutMs: Long,
  ) {
    ensureChannel(context, channelName)
    val manager = NotificationManagerCompat.from(context)
    // A different offer must ring afresh; the same offer only updates.
    if (activeOfferId(context) != offerId) manager.cancel(TAG, NOTIFICATION_ID)

    @Suppress("DEPRECATION")
    val builder = NotificationCompat.Builder(context, channelId(context))
      .setSmallIcon(smallIcon(context))
      .setContentTitle(title)
      .setContentText(body)
      .setStyle(NotificationCompat.BigTextStyle().bigText(body))
      .setPriority(NotificationCompat.PRIORITY_MAX)
      .setCategory(NotificationCompat.CATEGORY_ALARM)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .setOngoing(true)
      .setAutoCancel(false)
      .setOnlyAlertOnce(true)
      .setSound(soundUri(context), AudioManager.STREAM_ALARM)
      .setVibrate(VIBRATION)
      .setContentIntent(launchIntent(context, offerId, ACTION_OPEN, false, 1))
      .setFullScreenIntent(launchIntent(context, offerId, ACTION_OPEN, true, 2), true)
      .addAction(0, acceptLabel, launchIntent(context, offerId, ACTION_ACCEPT, false, 3))
      .addAction(0, rejectLabel, launchIntent(context, offerId, ACTION_REJECT, false, 4))
      .addExtras(Bundle().apply { putString(EXTRA_OFFER_ID, offerId) })
    if (timeoutMs > 0) builder.setTimeoutAfter(timeoutMs)
    val notification = builder.build()
    notification.flags = notification.flags or Notification.FLAG_INSISTENT
    // Notifications not allowed → nothing to show; the in-app check tells the driver
    if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return
    try {
      manager.notify(TAG, NOTIFICATION_ID, notification)
    } catch (ignored: SecurityException) {
      // revoked between the check and the post
    }
  }

  /** Silences the ring but leaves the offer on screen (the driver pressed «Անջատել ձայնը») */
  fun mute(context: Context) {
    NotificationManagerCompat.from(context).cancel(TAG, NOTIFICATION_ID)
  }

  /** Stops the ring and takes the app back off the lock screen */
  fun stop(context: Context) {
    NotificationManagerCompat.from(context).cancel(TAG, NOTIFICATION_ID)
    activityRef?.get()?.let { activity -> activity.runOnUiThread { showOverLock(activity, false) } }
  }

  /** The offer the alarm is ringing for right now, read from the posted notification itself */
  fun activeOfferId(context: Context): String? {
    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    return manager.activeNotifications
      .firstOrNull { it.id == NOTIFICATION_ID && it.tag == TAG }
      ?.notification?.extras?.getString(EXTRA_OFFER_ID)
  }

  /** A full alarm after `delayMs`, so the driver can lock the phone and check it really rings */
  fun test(context: Context, delayMs: Long, title: String, body: String, acceptLabel: String, rejectLabel: String, channelName: String?) {
    val app = context.applicationContext
    Handler(Looper.getMainLooper()).postDelayed({
      show(app, "test", title, body, acceptLabel, rejectLabel, channelName, 30_000)
    }, delayMs)
  }

  private fun launchIntent(context: Context, offerId: String, action: String, fullScreen: Boolean, requestCode: Int): PendingIntent {
    val intent = (context.packageManager.getLaunchIntentForPackage(context.packageName) ?: Intent()).apply {
      setPackage(context.packageName)
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
      putExtra(EXTRA_OFFER_ID, offerId)
      putExtra(EXTRA_ACTION, action)
      putExtra(EXTRA_FULL_SCREEN, fullScreen)
    }
    return PendingIntent.getActivity(context, requestCode, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
  }

  // ─── The activity side ───────────────────────────────────────────────────

  fun attach(activity: Activity) {
    activityRef = WeakReference(activity)
  }

  /**
   * The app was opened from the alarm: show over the lock screen and turn the
   * screen on (only for this — `stop()` turns both off again, so a locked
   * phone never shows the app otherwise), and hand the driver's choice to JS.
   */
  fun handleIntent(activity: Activity?, intent: Intent?) {
    if (intent == null) return
    val offerId = intent.getStringExtra(EXTRA_OFFER_ID) ?: return
    val action = intent.getStringExtra(EXTRA_ACTION) ?: ACTION_OPEN
    intent.removeExtra(EXTRA_OFFER_ID)
    intent.removeExtra(EXTRA_ACTION)
    intent.removeExtra(EXTRA_FULL_SCREEN)
    val target = activity ?: activityRef?.get()
    if (target != null) {
      if (action == ACTION_OPEN) {
        target.runOnUiThread { showOverLock(target, true) }
      } else {
        // A button was pressed: the driver has answered, the ring stops now.
        NotificationManagerCompat.from(target).cancel(TAG, NOTIFICATION_ID)
      }
    }
    val event = OfferAlarmAction(offerId, action)
    pending = event
    onAction?.invoke(event)
  }

  /** The last choice not yet taken by JS (also survives a cold start) */
  fun consume(): OfferAlarmAction? {
    val event = pending
    pending = null
    return event
  }

  @Suppress("DEPRECATION")
  private fun showOverLock(activity: Activity, on: Boolean) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
      activity.setShowWhenLocked(on)
      activity.setTurnScreenOn(on)
    } else {
      val flags = WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
      if (on) activity.window.addFlags(flags) else activity.window.clearFlags(flags)
    }
  }

  // ─── What the driver has to allow ────────────────────────────────────────

  fun status(context: Context): Map<String, Any?> {
    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    val audio = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
    val power = context.getSystemService(Context.POWER_SERVICE) as PowerManager
    val channel = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) manager.getNotificationChannel(channelId(context)) else null
    val filter = manager.currentInterruptionFilter
    return mapOf(
      "notificationsEnabled" to NotificationManagerCompat.from(context).areNotificationsEnabled(),
      "fullScreenAllowed" to (if (Build.VERSION.SDK_INT >= 34) manager.canUseFullScreenIntent() else true),
      "channelEnabled" to (channel == null || channel.importance != NotificationManager.IMPORTANCE_NONE),
      "channelBypassesDnd" to (channel?.canBypassDnd() ?: false),
      "dndActive" to (filter != NotificationManager.INTERRUPTION_FILTER_ALL && filter != NotificationManager.INTERRUPTION_FILTER_UNKNOWN),
      "alarmVolume" to audio.getStreamVolume(AudioManager.STREAM_ALARM),
      "alarmVolumeMax" to audio.getStreamMaxVolume(AudioManager.STREAM_ALARM),
      "ignoringBatteryOptimizations" to power.isIgnoringBatteryOptimizations(context.packageName),
      "sdk" to Build.VERSION.SDK_INT,
    )
  }

  /** The alarm volume to 80 % of its range if it is lower — only on the driver's tap */
  fun raiseAlarmVolume(context: Context): Boolean {
    val audio = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
    val target = Math.round(audio.getStreamMaxVolume(AudioManager.STREAM_ALARM) * 0.8f)
    return try {
      if (audio.getStreamVolume(AudioManager.STREAM_ALARM) < target) audio.setStreamVolume(AudioManager.STREAM_ALARM, target, 0)
      true
    } catch (ignored: SecurityException) {
      false
    }
  }

  fun openSettings(context: Context, which: String): Boolean {
    val pkg = context.packageName
    val details = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$pkg"))
    val intent = when {
      which == "fullScreen" && Build.VERSION.SDK_INT >= 34 ->
        Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, Uri.parse("package:$pkg"))
      which == "channel" && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O ->
        Intent(Settings.ACTION_CHANNEL_NOTIFICATION_SETTINGS)
          .putExtra(Settings.EXTRA_APP_PACKAGE, pkg)
          .putExtra(Settings.EXTRA_CHANNEL_ID, channelId(context))
      which == "notifications" && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O ->
        Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, pkg)
      which == "battery" -> Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)
      else -> details
    }
    return try {
      context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
      true
    } catch (notFound: ActivityNotFoundException) {
      try {
        context.startActivity(details.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        true
      } catch (failed: Exception) {
        false
      }
    }
  }
}
