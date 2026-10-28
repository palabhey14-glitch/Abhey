"""Builds the three Rewired email signatures as Gmail-safe HTML.

Tables and inline styles only, images loaded from the live site.
Usage: python3 make-signatures.py [out_dir]
"""
import pathlib
import sys

IMG = "https://rewiredbyabhey.com/assets/email"
NAVY, BLUE, SAND, SKY, GREY, LINE = "#0b2545", "#2444f9", "#f4c77d", "#e8f1fd", "#53677f", "#dbe4f2"
SERIF = "Georgia,'Times New Roman',serif"
SANS = "Arial,Helvetica,sans-serif"

EMAIL = "coaching@abheyrewired.com"
SITE = "https://rewiredbyabhey.com"
IG = "https://www.instagram.com/abhey.rewired/"
BOOK = "https://calendly.com/coaching-abheyrewired/30min"
ABN = "ABN 73 322 472 368"


def link(href, text, color, bold=False):
    weight = "font-weight:bold;" if bold else ""
    return f'<a href="{href}" style="color:{color};text-decoration:none;{weight}">{text}</a>'


def button(text, bg, fg):
    return (
        f'<table cellpadding="0" cellspacing="0" border="0" role="presentation"><tr>'
        f'<td bgcolor="{bg}" style="background:{bg};border-radius:6px;padding:9px 16px;">'
        f'<a href="{BOOK}" style="font-family:{SANS};font-size:13px;font-weight:bold;color:{fg};text-decoration:none;">{text}</a>'
        f"</td></tr></table>"
    )


def contacts(color, sep_color):
    dot = f' <span style="color:{sep_color};">&middot;</span> '
    return dot.join([
        link(f"mailto:{EMAIL}", EMAIL, color),
        link(SITE, "rewiredbyabhey.com", color),
        link(IG, "@abhey.rewired", color),
    ])


def classic():
    """Clean light. R mark, amber rule, blue call button."""
    return f"""<table cellpadding="0" cellspacing="0" border="0" role="presentation" style="font-family:{SANS};color:{NAVY};max-width:480px;">
<tr>
<td valign="top" style="padding:2px 16px 0 0;"><a href="{SITE}"><img src="{IMG}/r-mark.png" width="64" height="64" alt="Rewired Coaching" style="display:block;border:0;width:64px;height:64px;"></a></td>
<td valign="top" style="border-left:2px solid {SAND};padding:0 0 0 16px;">
<div style="font-family:{SERIF};font-size:22px;line-height:26px;color:{NAVY};">Abhey Pal</div>
<div style="font-size:11px;line-height:18px;letter-spacing:1.5px;color:{BLUE};font-weight:bold;padding-top:2px;">REWIRED COACHING</div>
<div style="font-size:13px;line-height:19px;color:{GREY};padding-bottom:8px;">12 Week Premium Designer Coaching</div>
<div style="font-size:12px;line-height:18px;padding-bottom:12px;">{contacts(NAVY, SAND)}</div>
{button("Book a Strategy Call &rarr;", BLUE, "#ffffff")}
<div style="font-size:10px;line-height:16px;color:#9fb0cc;padding-top:10px;">{ABN}</div>
</td>
</tr>
</table>"""


def navy():
    """Bold navy card, like the site hero. White logo, sand button."""
    return f"""<table cellpadding="0" cellspacing="0" border="0" role="presentation" bgcolor="{NAVY}" style="background:{NAVY};border-radius:12px;font-family:{SANS};max-width:440px;">
<tr><td style="padding:20px 22px 18px 22px;">
<a href="{SITE}"><img src="{IMG}/logo-full-white.png" width="200" height="37" alt="Rewired Coaching with Abhey Pal" style="display:block;border:0;width:200px;height:37px;"></a>
<div style="height:2px;width:36px;background:{SAND};line-height:2px;font-size:0;margin:16px 0 14px 0;">&nbsp;</div>
<div style="font-family:{SERIF};font-size:21px;line-height:25px;color:#ffffff;">Abhey Pal</div>
<div style="font-size:13px;line-height:19px;color:#adc5ff;padding-bottom:10px;">12 Week Premium Designer Coaching</div>
<div style="font-size:12px;line-height:18px;padding-bottom:14px;">{contacts("#ffffff", SAND)}</div>
{button("Book a Strategy Call &rarr;", SAND, NAVY)}
<div style="font-size:10px;line-height:16px;color:#9fb0cc;padding-top:12px;">{ABN}</div>
</td></tr>
</table>"""


def hook():
    """Sales-led. Plain details on top, the site's hook in a sky panel below."""
    return f"""<table cellpadding="0" cellspacing="0" border="0" role="presentation" style="font-family:{SANS};color:{NAVY};max-width:480px;">
<tr><td style="padding:0 0 12px 0;">
<div style="font-family:{SERIF};font-size:22px;line-height:26px;color:{NAVY};">Abhey Pal</div>
<div style="font-size:13px;line-height:19px;color:{GREY};">Coach, Rewired Coaching<span style="color:{SAND};">&nbsp;&middot;&nbsp;</span>12 Week Premium Designer Coaching</div>
<div style="font-size:12px;line-height:18px;padding-top:4px;">{contacts(BLUE, SAND)}</div>
</td></tr>
<tr><td bgcolor="{SKY}" style="background:{SKY};border-left:3px solid {BLUE};border-radius:0 8px 8px 0;padding:14px 16px;">
<table cellpadding="0" cellspacing="0" border="0" role="presentation" width="100%"><tr>
<td valign="middle" style="padding-right:12px;">
<div style="font-family:{SERIF};font-size:17px;line-height:22px;color:{NAVY};">Skinny fat at 30 isn't a life sentence.</div>
<div style="font-size:12px;line-height:18px;color:{GREY};padding-top:3px;">Build muscle and lose fat at the same time, with a coach who's done it for 15 years.</div>
<div style="font-size:13px;line-height:18px;padding-top:8px;">{link(BOOK, "Book a Strategy Call &rarr;", BLUE, bold=True)}</div>
</td>
<td valign="middle" width="44" style="width:44px;"><a href="{SITE}"><img src="{IMG}/r-mark.png" width="44" height="44" alt="Rewired Coaching" style="display:block;border:0;width:44px;height:44px;"></a></td>
</tr></table>
</td></tr>
<tr><td style="font-size:10px;line-height:16px;color:#9fb0cc;padding-top:8px;">{ABN}</td></tr>
</table>"""


SIGNATURES = {"1-classic": classic, "2-navy-card": navy, "3-hook": hook}

if __name__ == "__main__":
    out = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else pathlib.Path(__file__).parent)
    out.mkdir(parents=True, exist_ok=True)
    for name, fn in SIGNATURES.items():
        html = fn()
        (out / f"signature-{name}.html").write_text(
            f'<!doctype html><meta charset="utf-8"><title>Rewired signature {name}</title>\n'
            f'<body style="margin:24px;background:#fff;">\n{html}\n</body>\n'
        )
        print(name, len(html), "chars")
