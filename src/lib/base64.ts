const CHUNK_SIZE = 0x8000;

export const encodeBase64 = (data: ArrayBuffer | Uint8Array) => {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  let binary = "";

  for (let offset = 0; offset < bytes.length; offset += CHUNK_SIZE) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + CHUNK_SIZE));
  }

  return btoa(binary);
};
