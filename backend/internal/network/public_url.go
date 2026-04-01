package network

import (
	"context"
	"fmt"
	"net"
	"net/netip"
	"net/url"
	"strings"
)

var blockedPublicPrefixes = []netip.Prefix{
	netip.MustParsePrefix("0.0.0.0/8"),
	netip.MustParsePrefix("100.64.0.0/10"),
	netip.MustParsePrefix("192.0.0.0/24"),
	netip.MustParsePrefix("192.0.2.0/24"),
	netip.MustParsePrefix("198.18.0.0/15"),
	netip.MustParsePrefix("198.51.100.0/24"),
	netip.MustParsePrefix("203.0.113.0/24"),
	netip.MustParsePrefix("240.0.0.0/4"),
	netip.MustParsePrefix("2001:db8::/32"),
}

func ValidatePublicHTTPURL(ctx context.Context, rawURL string) (*url.URL, error) {
	trimmed := strings.TrimSpace(rawURL)
	if trimmed == "" {
		return nil, fmt.Errorf("unsafe URL: URL is required")
	}

	parsed, err := url.Parse(trimmed)
	if err != nil {
		return nil, fmt.Errorf("unsafe URL: invalid URL")
	}
	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return nil, fmt.Errorf("unsafe URL: only http and https URLs are allowed")
	}

	host := strings.ToLower(strings.TrimSpace(parsed.Hostname()))
	if host == "" {
		return nil, fmt.Errorf("unsafe URL: host is required")
	}
	if host == "localhost" || strings.HasSuffix(host, ".localhost") {
		return nil, fmt.Errorf("unsafe URL: local addresses are not allowed")
	}

	if address, err := netip.ParseAddr(host); err == nil {
		if !isPublicAddress(address.Unmap()) {
			return nil, fmt.Errorf("unsafe URL: local or reserved addresses are not allowed")
		}
		return parsed, nil
	}

	if ctx == nil {
		ctx = context.Background()
	}
	addresses, err := net.DefaultResolver.LookupNetIP(ctx, "ip", host)
	if err != nil || len(addresses) == 0 {
		return nil, fmt.Errorf("unsafe URL: host could not be resolved")
	}
	for _, address := range addresses {
		if !isPublicAddress(address.Unmap()) {
			return nil, fmt.Errorf("unsafe URL: local or reserved addresses are not allowed")
		}
	}
	return parsed, nil
}

func isPublicAddress(address netip.Addr) bool {
	if !address.IsValid() {
		return false
	}
	if address.IsLoopback() ||
		address.IsPrivate() ||
		address.IsMulticast() ||
		address.IsLinkLocalUnicast() ||
		address.IsLinkLocalMulticast() ||
		address.IsInterfaceLocalMulticast() ||
		address.IsUnspecified() {
		return false
	}
	for _, prefix := range blockedPublicPrefixes {
		if prefix.Contains(address) {
			return false
		}
	}
	return true
}
