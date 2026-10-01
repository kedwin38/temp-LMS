import os
import re
from django.http import StreamingHttpResponse


class RangeFileWrapper:
    """
    Wraps a file on disk to yield only the requested byte range in 64KB chunks.
    Prevents loading entire multi-hundred-megabyte video files into RAM.
    """
    def __init__(self, file_path, offset=0, length=None, chunk_size=65536):
        self.file_path = file_path
        self.offset = offset
        self.length = length
        self.chunk_size = chunk_size

    def __iter__(self):
        with open(self.file_path, 'rb') as f:
            f.seek(self.offset)
            remaining = self.length
            while remaining > 0:
                read_size = min(self.chunk_size, remaining)
                data = f.read(read_size)
                if not data:
                    break
                remaining -= len(data)
                yield data


def stream_video_file(request, file_path, content_type='video/mp4'):
    """
    Returns an HTTP 206 Partial Content response if HTTP Range is requested,
    or a standard 200 StreamingHttpResponse otherwise.
    """
    if not os.path.exists(file_path):
        return None

    file_size = os.path.getsize(file_path)
    range_header = request.META.get('HTTP_RANGE', '').strip()
    range_match = re.match(r'bytes=(\d+)-(\d+)?', range_header)

    if range_match:
        first_byte = int(range_match.group(1))
        last_byte = int(range_match.group(2)) if range_match.group(2) else file_size - 1
        last_byte = min(last_byte, file_size - 1)
        length = last_byte - first_byte + 1

        response = StreamingHttpResponse(
            RangeFileWrapper(file_path, offset=first_byte, length=length),
            status=206,
            content_type=content_type
        )
        response['Content-Length'] = str(length)
        response['Content-Range'] = f'bytes {first_byte}-{last_byte}/{file_size}'
    else:
        response = StreamingHttpResponse(
            RangeFileWrapper(file_path, offset=0, length=file_size),
            status=200,
            content_type=content_type
        )
        response['Content-Length'] = str(file_size)

    response['Accept-Ranges'] = 'bytes'
    return response