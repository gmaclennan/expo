// Copyright 2015-present 650 Industries. All rights reserved.

package expo.modules.fetch

import android.content.ContentResolver
import android.net.Uri
import expo.modules.filesystem.FileSystemPath
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.sharedobjects.SharedObject
import okhttp3.Call
import okhttp3.CookieJar
import okhttp3.MediaType
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody
import okhttp3.RequestBody.Companion.asRequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import okio.BufferedSink
import okio.source
import java.io.File
import java.net.URL

private data class RequestHolder(var request: Request?)

internal val METHODS_REQUIRING_BODY = arrayOf("POST", "PUT", "PATCH")

internal class NativeRequest(appContext: AppContext, internal val response: NativeResponse) :
  SharedObject(appContext) {
  private val requestHolder = RequestHolder(null)
  private var task: Call? = null

  fun start(client: OkHttpClient, url: URL, requestInit: NativeRequestInit, requestBody: ByteArray?) {
    val headers = requestInit.headers.toHeaders()
    val mediaType = headers["Content-Type"]?.toMediaTypeOrNull()
    val reqBody = requestBody?.toRequestBody(mediaType) ?: run {
      // OkHttp requires a non-null body for POST, PATCH, and PUT requests.
      // WinterTC fetch, however, does not have this limitation.
      // Provide an empty body to make OkHttp behave like WinterTC fetch.
      // Ref: https://github.com/expo/expo/issues/35950#issuecomment-3245173248
      if (requestInit.method in METHODS_REQUIRING_BODY) {
        byteArrayOf(0).toRequestBody(mediaType)
      } else {
        null
      }
    }
    enqueueRequest(client, url, requestInit, reqBody)
  }

  fun startWithFile(client: OkHttpClient, url: URL, requestInit: NativeRequestInit, file: SharedObject) {
    val headers = requestInit.headers.toHeaders()
    val mediaType = headers["Content-Type"]?.toMediaTypeOrNull()
    val fileSystemPath = file as? FileSystemPath
      ?: throw IllegalArgumentException(
        "fetch body must be a FileSystemFile object with a uri property, got ${file.javaClass.name}"
      )
    val uri = fileSystemPath.uri
    val path = uri.path
    val reqBody = if (uri.scheme == "content") {
      val context = appContext.reactContext
        ?: throw IllegalStateException("React context is not available")
      ContentUriRequestBody(context.contentResolver, uri, mediaType, fileSystemPath)
    } else if (path != null) {
      File(path).asRequestBody(mediaType)
    } else {
      throw IllegalArgumentException("File URI has no path: $uri")
    }
    enqueueRequest(client, url, requestInit, reqBody)
  }

  private fun enqueueRequest(client: OkHttpClient, url: URL, requestInit: NativeRequestInit, reqBody: RequestBody?) {
    val clientBuilder = client.newBuilder()
    if (requestInit.credentials != NativeRequestCredentials.INCLUDE) {
      clientBuilder.cookieJar(CookieJar.NO_COOKIES)
    }
    if (requestInit.redirect != NativeRequestRedirect.FOLLOW) {
      clientBuilder.followRedirects(false)
      clientBuilder.followSslRedirects(false)
    }

    val newClient = clientBuilder.build()
    response.redirectMode = requestInit.redirect

    val headers = requestInit.headers.toHeaders()
    val request = Request.Builder()
      .headers(headers)
      .method(requestInit.method, reqBody)
      .url(OkHttpFileUrlInterceptor.handleFileUrl(url))
      .build()
    this.requestHolder.request = request

    this.task = newClient.newCall(request)
    this.task?.enqueue(this.response)
    response.onStarted()
  }

  fun cancel() {
    val task = this.task ?: return
    task.cancel()
    response.emitRequestCanceled()
  }
}

/**
 * An OkHttp RequestBody that streams content from a content:// URI
 * via ContentResolver without loading the entire file into memory.
 */
private class ContentUriRequestBody(
  private val contentResolver: ContentResolver,
  private val uri: Uri,
  private val mediaType: MediaType?,
  private val fileSystemPath: FileSystemPath
) : RequestBody() {
  override fun contentType(): MediaType? = mediaType

  override fun contentLength(): Long {
    val length = fileSystemPath.file.length()
    return if (length > 0) length else -1L
  }

  override fun writeTo(sink: BufferedSink) {
    val inputStream = contentResolver.openInputStream(uri)
      ?: throw IllegalStateException("Unable to open input stream for URI: $uri")
    inputStream.use { stream ->
      sink.writeAll(stream.source())
    }
  }
}
