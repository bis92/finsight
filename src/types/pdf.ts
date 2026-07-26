/** Input for server-side PDF transaction extraction. The PDF bytes are sent as
 * base64 so they can travel through the JSON apiClient to the extract route. */
export type PdfExtractionInput = {
  fileName: string
  /** Base64-encoded PDF file bytes (no data: URL prefix). */
  dataBase64: string
}
