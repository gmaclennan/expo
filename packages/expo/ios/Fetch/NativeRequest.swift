// Copyright 2015-present 650 Industries. All rights reserved.

import ExpoModulesCore

/**
 A SharedObject for request.
 */
internal final class NativeRequest: SharedObject, @unchecked Sendable {
  internal let response: NativeResponse
  internal let task: ExpoURLSessionTask

  init(response: NativeResponse) {
    self.response = response
    self.task = ExpoURLSessionTask(delegate: self.response)
  }

  func start(
    urlSession: URLSession,
    urlSessionDelegate: URLSessionSessionDelegateProxy,
    url: URL,
    requestInit: NativeRequestInit,
    requestBody: Data?
  ) {
    self.response.redirectMode = requestInit.redirect
    self.task.start(
      urlSession: urlSession,
      urlSessionDelegate: urlSessionDelegate,
      url: url,
      requestInit: requestInit,
      requestBody: requestBody
    )
  }

  func startWithFile(
    urlSession: URLSession,
    urlSessionDelegate: URLSessionSessionDelegateProxy,
    url: URL,
    requestInit: NativeRequestInit,
    file: SharedObject
  ) throws {
    // Extract the file URL from the FileSystemPath shared object.
    // FileSystemPath is internal to ExpoFileSystem, so we use Mirror to access
    // the 'url' property since SharedObject does not inherit from NSObject.
    guard let fileURL = Self.extractURL(from: file) else {
      throw FetchFileBodyException()
    }
    self.response.redirectMode = requestInit.redirect
    self.task.startWithFile(
      urlSession: urlSession,
      urlSessionDelegate: urlSessionDelegate,
      url: url,
      requestInit: requestInit,
      fileURL: fileURL
    )
  }

  /// Extracts the `url` property from a FileSystemPath shared object using Mirror reflection.
  /// This traverses the class hierarchy since `url` is defined on FileSystemPath (a superclass).
  private static func extractURL(from object: Any) -> URL? {
    var mirror: Mirror? = Mirror(reflecting: object)
    while let current = mirror {
      for child in current.children where child.label == "url" {
        if let url = child.value as? URL {
          return url
        }
      }
      mirror = current.superclassMirror
    }
    return nil
  }

  func cancel(urlSessionDelegate: URLSessionSessionDelegateProxy) {
    self.task.cancel(urlSessionDelegate: urlSessionDelegate)
    self.response.emitRequestCanceled()
  }
}
