// Copyright 2024-present 650 Industries. All rights reserved.

import ExpoModulesCore

struct CreateOptions: Record {
  @Field var intermediates: Bool = false
  @Field var overwrite: Bool = false
  @Field var idempotent: Bool = false
}

struct DownloadOptions: Record {
  @Field var headers: [String: String]?
  @Field var idempotent: Bool = false
}

struct FileInfo: Record {
  @Field var exists: Bool
  @Field var uri: String?
  @Field var md5: String?
  @Field var size: Int64?
  @Field var modificationTime: Int64?
  @Field var creationTime: Int64?
}

struct PathInfo: Record {
  @Field var exists: Bool
  @Field var isDirectory: Bool?
}

struct DirectoryInfo: Record {
  @Field var exists: Bool
  @Field var uri: String?
  @Field var files: [String]?
  @Field var size: Int64?
  @Field var modificationTime: Int64?
  @Field var creationTime: Int64?
}

enum WriteEncoding: String, Enumerable {
  case utf8
  case base64
}

struct WriteOptions: Record {
  @Field var encoding: WriteEncoding?
  @Field var append: Bool = false
}

enum UploadType: Int, Enumerable {
  case binaryContent = 0
  case multipart = 1
}

enum UploadHttpMethod: String, Enumerable {
  case POST
  case PUT
  case PATCH
}

struct UploadOptions: Record {
  @Field var headers: [String: String] = [:]
  @Field var httpMethod: UploadHttpMethod = .POST
  @Field var uploadType: UploadType = .binaryContent
  @Field var fieldName: String?
  @Field var mimeType: String?
  @Field var parameters: [String: String]?
}

class UploadResult: Record {
  @Field var body: String?
  @Field var status: Int = 0
  @Field var headers: [String: String] = [:]
}
