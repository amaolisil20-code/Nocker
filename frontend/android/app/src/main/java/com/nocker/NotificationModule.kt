package com.nocker.app

import android.content.Intent
import android.provider.Settings
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import org.json.JSONObject

class NotificationModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName() = "NockerNotifications"

    init {
        NotificationService.reactContext = reactContext
    }

    @ReactMethod
    fun hasPermission(promise: Promise) {
        val enabled = Settings.Secure.getString(
            reactContext.contentResolver,
            "enabled_notification_listeners"
        ) ?: ""
        promise.resolve(enabled.contains(reactContext.packageName))
    }

    @ReactMethod
    fun requestPermission() {
        val intent = Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)
        intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK
        reactContext.startActivity(intent)
    }

    @ReactMethod
    fun addListener(eventName: String) { /* React Native exige isso */ }

    @ReactMethod
    fun removeListeners(count: Int) { /* React Native exige isso */ }

    companion object {
        fun sendTransactionEvent(ctx: ReactApplicationContext, data: JSONObject) {
            val params = Arguments.createMap().apply {
                putDouble("amount", data.getDouble("amount"))
                putString("type", data.getString("type"))
                putString("description", data.getString("description"))
                putString("bank", data.getString("bank"))
                putString("raw", data.getString("raw"))
            }
            ctx.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit("NockerTransaction", params)
        }
    }
}