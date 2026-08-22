export function isCancelledDocumentDataLoad(
  requestUrl: string,
  errorText: string | undefined,
  origin: string,
  route: string,
): boolean {
  const documentPath = new URL(route, origin).pathname;
  const dataPath = `${documentPath === "/" ? "" : documentPath}/__data.json`;
  const url = new URL(requestUrl);

  return errorText === "net::ERR_ABORTED" && url.origin === origin && url.pathname === dataPath;
}
