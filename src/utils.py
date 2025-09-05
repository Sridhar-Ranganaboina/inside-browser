def normalize_url(url: str) -> str:
    return url.rstrip('/')

def make_css_selector_from_attrs(tag: str, attrs: dict) -> str:
    parts = [tag]
    if attrs.get("id"):
        parts.append(f"#{attrs['id']}")
    elif attrs.get("class"):
        classes = ".".join([c for c in attrs.get("class", []) if c.strip()])
        if classes:
            parts.append(f".{classes}")
    return "".join(parts)
