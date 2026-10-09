#!/bin/sh
# Black Mask chat panel: framing allow-list (launch-plan step B2).
#
# Run by the nginx image's entrypoint before nginx starts. Reads
# BLACK_MASK_FRAME_ANCESTORS — the origins allowed to frame the chat panel,
# separated by spaces and/or commas — and writes the panel's framing headers
# to $BLACK_MASK_FRAME_CONF (default /etc/nginx/blackout/embed-frame.conf).
# docker-nginx.conf includes that file in the two panel locations (/embed and
# /embed/*) and nowhere else; every other route always gets
# frame-ancestors 'none'.
#
# Fails closed:
#   - unset or empty         -> the panel keeps frame-ancestors 'none'
#   - ANY entry invalid      -> the whole list is rejected, the panel keeps
#                               'none' (a typo must not half-apply a list)
#   - the file can't be written -> it is left as it was (the image ships it
#                               denying all framing)
# It always exits 0, so a bad value cannot stop the chat app from serving; it
# logs what it rejected instead.
#
# Accepted origins (scheme://host[:port] only: no path, not even a trailing
# slash; no wildcard; no quotes, keywords or other CSP syntax):
#   https://<hostname>[:port]                 dot-separated LDH labels
#   http://localhost[:port]
#   http://127.0.0.1[:port]                   local testing only
#   chrome-extension://<32 letters a-p>       Chromium-based browsers
#   moz-extension://<uuid>                    Firefox (per-install; see docs)
#   safari-web-extension://<uuid>             Safari
# Scheme and host are case-insensitive and are lower-cased.

set -u
# No globbing: an entry of '*' must stay a literal '*' (and be rejected), not
# expand to file names.
set -f

ME="40-black-mask-frame-ancestors"
CONF="${BLACK_MASK_FRAME_CONF:-/etc/nginx/blackout/embed-frame.conf}"
RAW="${BLACK_MASK_FRAME_ANCESTORS:-}"

info() { printf '%s: %s\n' "$ME" "$*"; }
warn() { printf '%s: %s\n' "$ME" "$*" >&2; }

ORIGIN_RE='^(https://([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]([a-z0-9-]{0,61}[a-z0-9])?(:[0-9]{1,5})?|http://(localhost|127\.0\.0\.1)(:[0-9]{1,5})?|chrome-extension://[a-p]{32}|moz-extension://[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|safari-web-extension://[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$'

valid_origin() {
    printf '%s\n' "$1" | grep -Eq "$ORIGIN_RE" || return 1
    case "$1" in
        *://*:*)
            port=${1##*:}
            # The regex already limits the port to 1-5 digits.
            [ "$port" -ge 1 ] && [ "$port" -le 65535 ] || return 1
            ;;
    esac
    return 0
}

write_conf() {
    # $1: file body. Written to a temp file and moved into place so nginx
    # never reads a half-written include.
    dir=$(dirname "$CONF")
    tmp="$CONF.tmp.$$"
    if ! mkdir -p "$dir" 2>/dev/null || ! printf '%s\n' "$1" >"$tmp" 2>/dev/null || ! mv -f "$tmp" "$CONF" 2>/dev/null; then
        rm -f "$tmp" 2>/dev/null
        warn "could not write $CONF; it is left as it was (the image ships it denying all framing)"
        return 0
    fi
}

write_deny() {
    write_conf "# Generated at container start by $ME: chat panel framing DENIED.
# Reason: $1
add_header X-Frame-Options \"DENY\" always;
add_header Content-Security-Policy \"frame-ancestors 'none'\" always;"
}

# Commas and carriage returns (CRLF env files) separate entries like spaces.
entries=$(printf '%s' "$RAW" | tr ',\r' '  ')

allowed=""
invalid=""
for entry in $entries; do
    origin=$(printf '%s' "$entry" | tr 'A-Z' 'a-z')
    if valid_origin "$origin"; then
        case " $allowed " in
            *" $origin "*) ;;
            *) allowed="${allowed:+$allowed }$origin" ;;
        esac
    else
        invalid="${invalid:+$invalid }[$entry]"
    fi
done

if [ -n "$invalid" ]; then
    warn "BLACK_MASK_FRAME_ANCESTORS rejected; invalid entries: $invalid"
    warn "the chat panel keeps frame-ancestors 'none' until every entry is a bare origin (scheme://host[:port])"
    write_deny "BLACK_MASK_FRAME_ANCESTORS had invalid entries"
    exit 0
fi

if [ -z "$allowed" ]; then
    info "BLACK_MASK_FRAME_ANCESTORS is empty; the chat panel cannot be framed (frame-ancestors 'none')"
    write_deny "BLACK_MASK_FRAME_ANCESTORS is empty or unset"
    exit 0
fi

case " $allowed " in
    *" moz-extension://"*)
        warn "moz-extension origins are per-install in Firefox; this allows exactly one installation"
        ;;
esac

# No X-Frame-Options on the panel when an allow-list is set: it cannot express
# an allow-list (ALLOW-FROM is obsolete and ignored), and DENY next to an
# allow-list would contradict it in any browser that still reads X-Frame-Options
# over CSP.
write_conf "# Generated at container start by $ME from BLACK_MASK_FRAME_ANCESTORS.
add_header Content-Security-Policy \"frame-ancestors $allowed\" always;"
info "chat panel (/embed) may be framed by: $allowed"
exit 0
