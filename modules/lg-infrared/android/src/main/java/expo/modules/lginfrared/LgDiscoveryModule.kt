package expo.modules.lginfrared

import android.content.Context
import android.content.Intent
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.wifi.WifiManager
import android.provider.Settings
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.SocketTimeoutException
import java.util.concurrent.atomic.AtomicInteger

/** Bounded, user-initiated SSDP discovery. No subnet scanning or background service. */
class LgDiscoveryModule : Module() {
  private val generation = AtomicInteger(0)
  @Volatile private var activeSocket: DatagramSocket? = null

  private fun cancel() {
    generation.incrementAndGet()
    activeSocket?.close()
    activeSocket = null
  }

  override fun definition() = ModuleDefinition {
    Name("LgDiscovery")
    Function("cancel") { cancel() }
    Function("openWifiSettings") {
      val context = appContext.reactContext ?: throw IllegalStateException("Android indisponible")
      context.startActivity(Intent(Settings.ACTION_WIFI_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }
    AsyncFunction("discover") {
      val context = appContext.reactContext ?: throw IllegalStateException("Android indisponible")
      scan(context)
    }
    OnDestroy { cancel() }
  }

  private fun scan(context: Context): List<Map<String, String>> {
    cancel()
    val scanId = generation.get()
    val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
    val network = cm.allNetworks.firstOrNull {
      cm.getNetworkCapabilities(it)?.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) == true
    } ?: throw IllegalStateException("Activez le Wi-Fi et rejoignez le réseau de la TV.")
    val wifi = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
    val lock = wifi.createMulticastLock("lg-cmd-discovery").apply { setReferenceCounted(false) }
    val socket = DatagramSocket(null)
    val found = linkedMapOf<String, Map<String, String>>()
    try {
      socket.reuseAddress = true
      socket.bind(InetSocketAddress(0))
      network.bindSocket(socket) // Never bind the whole app or send discovery via mobile data.
      socket.soTimeout = 350
      activeSocket = socket
      if (generation.get() != scanId) return emptyList()
      lock.acquire()
      val services = listOf("urn:lge-com:service:webos-second-screen:1", "urn:lge-com:service:netrcu:1")
      fun search() {
        services.forEach { service ->
          val message = "M-SEARCH * HTTP/1.1\r\nHOST: 239.255.255.250:1900\r\nMAN: \"ssdp:discover\"\r\nMX: 2\r\nST: $service\r\n\r\n"
          val bytes = message.toByteArray(Charsets.US_ASCII)
          socket.send(DatagramPacket(bytes, bytes.size, InetAddress.getByName("239.255.255.250"), 1900))
        }
      }
      search()
      val started = android.os.SystemClock.elapsedRealtime()
      var repeated = false
      while (generation.get() == scanId && android.os.SystemClock.elapsedRealtime() - started < 6500) {
        if (!repeated && android.os.SystemClock.elapsedRealtime() - started > 3000) { search(); repeated = true }
        val packet = DatagramPacket(ByteArray(4096), 4096)
        try { socket.receive(packet) } catch (_: SocketTimeoutException) { continue }
        val address = packet.address
        if (!address.isSiteLocalAddress && !address.isLinkLocalAddress) continue
        val host = address.hostAddress ?: continue
        if (host.contains(':')) continue // IPv6 requires separate discovery and URL handling.
        val response = String(packet.data, 0, packet.length, Charsets.UTF_8)
        if (!response.startsWith("HTTP/1.1 200")) continue
        val headers = response.lineSequence().mapNotNull { line ->
          val separator = line.indexOf(':')
          if (separator <= 0) null else line.substring(0, separator).trim().lowercase() to line.substring(separator + 1).trim()
        }.toMap()
        val service = headers["st"] ?: continue
        if (services.none { it.equals(service, ignoreCase = true) }) continue
        // Ignore LOCATION supplied by an untrusted peer; no arbitrary HTTP fetching.
        found[host + service] = mapOf("host" to host, "service" to service, "id" to (headers["usn"] ?: host).take(200))
        if (found.size >= 40) break
      }
    } catch (error: Exception) {
      if (generation.get() == scanId) throw error
    } finally {
      socket.close()
      if (activeSocket === socket) activeSocket = null
      if (lock.isHeld) lock.release()
    }
    return if (generation.get() == scanId) found.values.toList() else emptyList()
  }
}
