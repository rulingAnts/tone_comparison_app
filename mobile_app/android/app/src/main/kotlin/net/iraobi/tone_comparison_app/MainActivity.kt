package net.iraobi.tone_comparison_app

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.EventChannel
import io.flutter.plugin.common.MethodChannel
import java.io.File
import java.io.FileOutputStream

class MainActivity : FlutterActivity() {
	private val METHOD_CHANNEL = "app.intent/channel"
	private val EVENT_CHANNEL = "app.intent/events"
	private var events: EventChannel.EventSink? = null
	private var initialSharedPath: String? = null

	override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
		super.configureFlutterEngine(flutterEngine)

		MethodChannel(flutterEngine.dartExecutor.binaryMessenger, METHOD_CHANNEL)
			.setMethodCallHandler { call, result ->
				when (call.method) {
					"getInitialSharedPath" -> result.success(initialSharedPath)
					else -> result.notImplemented()
				}
			}

		EventChannel(flutterEngine.dartExecutor.binaryMessenger, EVENT_CHANNEL)
			.setStreamHandler(object : EventChannel.StreamHandler {
				override fun onListen(arguments: Any?, events: EventChannel.EventSink?) {
					this@MainActivity.events = events
				}
				override fun onCancel(arguments: Any?) {
					this@MainActivity.events = null
				}
			})
	}

	override fun onCreate(savedInstanceState: Bundle?) {
		super.onCreate(savedInstanceState)
		handleIntent(intent, isInitial = true)
	}

	override fun onNewIntent(intent: Intent) {
		super.onNewIntent(intent)
		handleIntent(intent, isInitial = false)
	}

	private fun handleIntent(intent: Intent?, isInitial: Boolean) {
		if (intent == null) return
		val action = intent.action
		if (Intent.ACTION_VIEW == action || Intent.ACTION_SEND == action) {
			val uri: Uri? = intent.data ?: intent.getParcelableExtra(Intent.EXTRA_STREAM)
			uri?.let {
				val path = copyUriToCache(it)
				if (path != null) {
					if (isInitial) {
						initialSharedPath = path
					}
					events?.success(path)
				}
			}
		}
	}

	private fun copyUriToCache(uri: Uri): String? {
		return try {
			val resolver = contentResolver
			val input = resolver.openInputStream(uri) ?: return null
			val fileName = uri.lastPathSegment?.substringAfterLast('/') ?: "shared_bundle.tncmp"
			val outFile = File(cacheDir, fileName)
			FileOutputStream(outFile).use { output ->
				input.copyTo(output)
			}
			outFile.absolutePath
		} catch (e: Exception) {
			null
		}
	}
}
