from rest_framework_simplejwt.authentication import JWTAuthentication


class QueryParamJWTAuthentication(JWTAuthentication):
    """
    Same as JWTAuthentication, but falls back to a `token` query parameter
    when no Authorization header is present.

    Needed for the video streaming endpoint: a native <video> tag issues its
    own GET/Range requests directly (for seeking/scrubbing) and cannot attach
    a bearer header, so the access token is passed as `?token=...` instead.
    """

    def authenticate(self, request):
        header = self.get_header(request)
        if header is not None:
            return super().authenticate(request)

        raw_token = request.GET.get('token')
        if not raw_token:
            return None

        validated_token = self.get_validated_token(raw_token)
        return self.get_user(validated_token), validated_token
