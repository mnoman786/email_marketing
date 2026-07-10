from django.db import migrations

# 68 more built-in templates (on top of the 32 from migrations 0003/0005),
# bringing the system library to 100. Every template opens with a spintax
# greeting and carries at least one more spintax choice in the body, so a
# single template still produces varied wording across sends — matches
# apps.campaigns.services.render_template_for_contact's spin() step, which
# already runs the same {a|b|c} syntax used elsewhere in this app.
MERGE_TAGS = ['first_name', 'last_name', 'company', 'title', 'sender_name', 'sender_company']

TEMPLATES = [
    # ── Cold Intro (+3) ──────────────────────────────────────────────
    {
        'name': 'Cold Intro — Straight to the Point',
        'category': 'cold_intro',
        'subject': '{{company}} + {{sender_company}}?',
        'preview_text': 'A quick, no-fluff reason to connect.',
        'html': [
            "{Hi|Hey} {{first_name}},",
            "We help teams {reduce|cut down|shrink} [problem] without adding headcount — thought it might be relevant for {{company}}.",
            "{Worth|Open to} a quick chat this week?",
            "{{sender_name}}",
        ],
    },
    {
        'name': 'Curiosity Opener',
        'category': 'cold_intro',
        'subject': 'Random question, {{first_name}}',
        'preview_text': 'A quick question about how things work today.',
        'html': [
            "Hi {{first_name}},",
            "{Random|Quick|Odd} question — does {{company}} have a process for [X] yet, or is it still {ad hoc|manual|a work in progress}?",
            "If it's the latter, I {might|may} be able to help.",
            "{{sender_name}}",
        ],
    },
    {
        'name': 'Direct Value Prop',
        'category': 'cold_intro',
        'subject': "For {{company}}'s {{title}} team",
        'preview_text': 'A specific reason this might matter to your role.',
        'html': [
            "Hi {{first_name}},",
            "{{sender_company}} helps {{title}}s at companies like {{company}} {save hours each week|cut manual work|move faster} on [task].",
            "{Interested|Want to see how it works}?",
            "{{sender_name}}",
        ],
    },

    # ── Follow-up (+6) ───────────────────────────────────────────────
    {
        'name': 'Gentle Nudge',
        'category': 'follow_up',
        'subject': 'Re: {{company}} — following up',
        'preview_text': 'A soft reminder in case this slipped through.',
        'html': [
            "{Hi|Hey} {{first_name}},",
            "{Didn't want this to get lost|Wanted to make sure this didn't slip through|Just floating this back up} in your inbox.",
            "{No rush|Whenever's convenient} — happy to answer anything.",
            "{{sender_name}}",
        ],
    },
    {
        'name': 'Did This Get Buried?',
        'category': 'follow_up',
        'subject': 'Did my last note get buried?',
        'preview_text': 'Checking in case the timing was off.',
        'html': [
            "Hi {{first_name}},",
            "{Inboxes get busy|Things get buried fast|I know how it goes} — did my last note reach you okay?",
            "Happy to {resend|recap} if it's easier.",
            "{{sender_name}}",
        ],
    },
    {
        'name': 'Quick Bump — Any Thoughts?',
        'category': 'follow_up',
        'subject': 'Any thoughts, {{first_name}}?',
        'preview_text': 'A short check-in for early feedback.',
        'html': [
            "Hi {{first_name}},",
            "{Curious|Wondering} if you had a chance to look this over — {any thoughts|any initial reaction}?",
            "Happy to adjust based on what matters most to {{company}}.",
            "{{sender_name}}",
        ],
    },
    {
        'name': 'Still Interested?',
        'category': 'follow_up',
        'subject': 'Still on your radar?',
        'preview_text': 'Confirming this is still worth pursuing.',
        'html': [
            "Hi {{first_name}},",
            "{Still|Just checking if this is still} on your radar for {{company}}? {Totally fine|No worries} if priorities shifted.",
            "Let me know either way so I'm not cluttering your inbox.",
            "{{sender_name}}",
        ],
    },
    {
        'name': 'One More Try',
        'category': 'follow_up',
        'subject': "Trying again — {{first_name}}",
        'preview_text': 'One more attempt before stepping back.',
        'html': [
            "Hi {{first_name}},",
            "{Giving this one more shot|Trying once more} before I {step back|leave it alone} for a while.",
            "If [problem] is still relevant to {{company}}, I'd love to help.",
            "{{sender_name}}",
        ],
    },
    {
        'name': 'Circling Back',
        'category': 'follow_up',
        'subject': 'Circling back, {{first_name}}',
        'preview_text': 'Reconnecting after some time has passed.',
        'html': [
            "Hi {{first_name}},",
            "{Circling back|Coming back around|Reconnecting} on this — {been a bit|it's been a while} since we last spoke.",
            "Still {happy|glad} to walk through it whenever works.",
            "{{sender_name}}",
        ],
    },

    # ── Break-up (+5) ────────────────────────────────────────────────
    {
        'name': 'Closing the Loop',
        'category': 'breakup',
        'subject': 'Closing the loop, {{first_name}}',
        'preview_text': "Wrapping up since I haven't heard back.",
        'html': [
            "Hi {{first_name}},",
            "{Haven't heard back|No response yet}, so I'll {assume now isn't the time|close this out} for {{company}}.",
            "{Feel free to reach out|My inbox is open} whenever it makes sense.",
            "{{sender_name}}",
        ],
    },
    {
        'name': 'Last Attempt',
        'category': 'breakup',
        'subject': 'Last one from me, {{first_name}}',
        'preview_text': 'A final note before stepping away.',
        'html': [
            "Hi {{first_name}},",
            "{This will be my last note|Last try from me} — {didn't want to keep cluttering your inbox|not trying to be a pest}.",
            "If things change, {{sender_company}} will still be here.",
            "{{sender_name}}",
        ],
    },
    {
        'name': 'Should I Stop Reaching Out?',
        'category': 'breakup',
        'subject': 'Should I stop reaching out?',
        'preview_text': "A direct question rather than assuming.",
        'html': [
            "Hi {{first_name}},",
            "{Genuinely curious|Just checking} — should I stop reaching out, or is the timing just off right now?",
            "{Either answer is fine|No wrong answer here} — just want to respect your inbox.",
            "{{sender_name}}",
        ],
    },
    {
        'name': 'Moving On — Door\'s Open',
        'category': 'breakup',
        'subject': "I'll leave it here, {{first_name}}",
        'preview_text': "Stepping back, but staying reachable.",
        'html': [
            "Hi {{first_name}},",
            "{I'll leave it here|I'll stop following up} for now — {sounds like|seems like} the timing isn't right for {{company}}.",
            "{The door's open|Reach out anytime} if that changes.",
            "{{sender_name}}",
        ],
    },
    {
        'name': 'Final Note From Me',
        'category': 'breakup',
        'subject': 'One final note',
        'preview_text': 'A last, low-pressure check-in.',
        'html': [
            "Hi {{first_name}},",
            "{Not trying to be pushy|Last thing, I promise} — just wanted to check once more before I stop reaching out.",
            "{No hard feelings either way|Totally understand if it's a no}.",
            "{{sender_name}}",
        ],
    },

    # ── Meeting (+5) ─────────────────────────────────────────────────
    {
        'name': 'Quick 15 This Week?',
        'category': 'meeting',
        'subject': '15 minutes this week, {{first_name}}?',
        'preview_text': 'A short call to see if this fits.',
        'html': [
            "Hi {{first_name}},",
            "{Would you be open to|Any chance you'd have} 15 minutes this week to see if this fits {{company}}?",
            "{Happy to work around your schedule|Whatever time works for you}.",
            "{{sender_name}}",
        ],
    },
    {
        'name': 'Calendar Link Inside',
        'category': 'meeting',
        'subject': 'Grab a time that works, {{first_name}}',
        'preview_text': 'Book directly, whenever suits you.',
        'html': [
            "Hi {{first_name}},",
            "{Easiest way to find time|Simplest way to connect} — here's my calendar, grab whatever {slot|time} works best.",
            "{Looking forward to it|Talk soon}.",
            "{{sender_name}}",
        ],
    },
    {
        'name': 'Confirming Our Time',
        'category': 'meeting',
        'subject': 'Confirming our call, {{first_name}}',
        'preview_text': 'Making sure the scheduled time still works.',
        'html': [
            "Hi {{first_name}},",
            "{Just confirming|Wanted to double-check} our call is still on — {let me know if anything's changed|shout if you need to move it}.",
            "{Talk soon|Looking forward to it}.",
            "{{sender_name}}",
        ],
    },
    {
        'name': 'Can We Grab 20 Minutes?',
        'category': 'meeting',
        'subject': '20 minutes for {{company}}?',
        'preview_text': 'A short, focused conversation.',
        'html': [
            "Hi {{first_name}},",
            "{Could we grab|Would 20 minutes for} a quick call work sometime this week? {Just want to understand|Curious about} {{company}}'s current approach to [X].",
            "{Whatever's easiest for you|Happy to fit your schedule}.",
            "{{sender_name}}",
        ],
    },
    {
        'name': 'Rescheduling Our Call',
        'category': 'meeting',
        'subject': 'Need to reshuffle, {{first_name}}',
        'preview_text': 'A quick note about moving our time.',
        'html': [
            "Hi {{first_name}},",
            "{Something came up|A conflict popped up} on my end — {mind if we reschedule|could we find another time}?",
            "Sorry for the {shuffle|hassle} — here's my calendar to grab a new slot.",
            "{{sender_name}}",
        ],
    },

    # ── Case Study (+5) ──────────────────────────────────────────────
    {
        'name': 'How a Similar Company Cut Costs',
        'category': 'case_study',
        'subject': 'How a team like {{company}} cut [metric]',
        'preview_text': 'A quick result from a comparable customer.',
        'html': [
            "Hi {{first_name}},",
            "A company {similar to|about the same size as} {{company}} used {{sender_company}} to {cut|reduce|lower} [metric] by [X]% in {{'a quarter'|'about 8 weeks'|'under two months'}}.",
            "{Happy to share how|Want the details}?",
            "{{sender_name}}",
        ],
    },
    {
        'name': "A Story Similar to {{company}}'s",
        'category': 'case_study',
        'subject': 'Thought this story might resonate',
        'preview_text': "A customer story that mirrors your situation.",
        'html': [
            "Hi {{first_name}},",
            "{Read|Came across} a customer story that {reminded me of|felt a lot like} {{company}}'s situation — {similar size|similar stage}, similar challenge with [problem].",
            "{Happy to send it over|Want me to share it}?",
            "{{sender_name}}",
        ],
    },
    {
        'name': 'Real Results From a Real Customer',
        'category': 'case_study',
        'subject': 'Real numbers, not a sales pitch',
        'preview_text': 'Concrete results, no marketing spin.',
        'html': [
            "Hi {{first_name}},",
            "{Not trying to oversell this|No fluff here} — one customer saw {a 30% lift in reply rates|a 2x improvement in output|meaningfully faster turnaround} within the first month.",
            "{Happy to walk through exactly how|Want the specifics}?",
            "{{sender_name}}",
        ],
    },
    {
        'name': 'Proof It Works',
        'category': 'case_study',
        'subject': "Proof, not promises",
        'preview_text': 'Concrete evidence instead of claims.',
        'html': [
            "Hi {{first_name}},",
            "{Rather than making claims|Instead of just telling you}, here's what an actual customer experienced after switching to {{sender_company}}: [specific result].",
            "{Want the full story|Curious to see it}?",
            "{{sender_name}}",
        ],
    },
    {
        'name': 'What Our Best Customers Have in Common',
        'category': 'case_study',
        'subject': 'What our best customers have in common',
        'preview_text': 'A pattern worth sharing with you.',
        'html': [
            "Hi {{first_name}},",
            "{Noticed|Found} a pattern across our best customers — {most|nearly all} of them started exactly where {{company}} is now with [problem].",
            "{Happy to share what changed for them|Want to hear how they got past it}?",
            "{{sender_name}}",
        ],
    },

    # ── Referral (+5) ────────────────────────────────────────────────
    {
        'name': "Know Anyone Who'd Want This?",
        'category': 'referral',
        'subject': "Know anyone who'd find this useful?",
        'preview_text': 'A quick ask for a pointer, not a pitch.',
        'html': [
            "Hi {{first_name}},",
            "{Not sure if this is for you|This might not be your area}, but if you know someone at {{company}} who owns [X], {a quick intro|a pointer} would be appreciated.",
            "{Thanks either way|Appreciate you reading this far}.",
            "{{sender_name}}",
        ],
    },
    {
        'name': 'Quick Intro Request',
        'category': 'referral',
        'subject': 'A small ask, {{first_name}}',
        'preview_text': 'A brief request for an introduction.',
        'html': [
            "Hi {{first_name}},",
            "{Small ask|Quick favor} — could you point me to whoever handles [X] at {{company}}? {Happy to keep it brief|Won't take much of their time}.",
            "{Appreciate it|Thanks in advance}.",
            "{{sender_name}}",
        ],
    },
    {
        'name': 'Pointing Me in the Right Direction',
        'category': 'referral',
        'subject': 'Pointing me the right way?',
        'preview_text': 'Asking for the right contact.',
        'html': [
            "Hi {{first_name}},",
            "{Trying to find|Hoping to reach} the right person at {{company}} for [X] — {any chance you could point me their way|know who that'd be}?",
            "{No worries if not|Totally understand if you're not the right person}.",
            "{{sender_name}}",
        ],
    },
    {
        'name': 'A Warm Intro Would Mean a Lot',
        'category': 'referral',
        'subject': 'A warm intro would help a lot',
        'preview_text': 'A personal ask for a connection.',
        'html': [
            "Hi {{first_name}},",
            "{If it's not too much trouble|If you're open to it}, a quick intro to whoever handles [X] at {{company}} would {mean a lot|really help}.",
            "{Happy to send context you can forward|I can draft a short blurb to make it easy}.",
            "{{sender_name}}",
        ],
    },
    {
        'name': 'Who Should I Really Be Talking To?',
        'category': 'referral',
        'subject': 'Who should I really be talking to?',
        'preview_text': 'Making sure the outreach lands with the right person.',
        'html': [
            "Hi {{first_name}},",
            "{Realized|Suspect} I might not have the right person — who at {{company}} would actually own a decision like this?",
            "{Happy to redirect|Just want to save everyone's time}.",
            "{{sender_name}}",
        ],
    },

    # ── Event (+6) ───────────────────────────────────────────────────
    {
        'name': 'Save the Date',
        'category': 'event',
        'subject': 'Save the date, {{first_name}}',
        'preview_text': 'An upcoming session worth blocking time for.',
        'html': [
            "Hi {{first_name}},",
            "{Wanted to give you a heads-up|Flagging this early} — we've got a session on [topic] coming up that {{title}}s tend to find useful.",
            "{Save the date|Mark your calendar} — details to follow.",
            "{{sender_name}}",
        ],
    },
    {
        'name': 'One Seat Left',
        'category': 'event',
        'subject': "Almost full — {{first_name}}",
        'preview_text': 'A gentle nudge before the session fills up.',
        'html': [
            "Hi {{first_name}},",
            "{Spots are filling up|We're almost at capacity} for [event] — {didn't want you to miss it|wanted to make sure you saw this}.",
            "{Grab a seat here|Reserve your spot} if you're interested.",
            "{{sender_name}}",
        ],
    },
    {
        'name': 'Live Session This Week',
        'category': 'event',
        'subject': 'Live session this {week|Thursday|month}',
        'preview_text': 'An upcoming live event you might enjoy.',
        'html': [
            "Hi {{first_name}},",
            "We're running a {live session|workshop|Q&A} on [topic] {this week|Thursday|later this month} — {thought it might be relevant|figured you'd find it useful} for {{company}}.",
            "{Want the link|Interested}?",
            "{{sender_name}}",
        ],
    },
    {
        'name': "You're on the List — Confirm Your Spot",
        'category': 'event',
        'subject': 'Confirm your spot, {{first_name}}',
        'preview_text': 'A quick confirmation to lock in attendance.',
        'html': [
            "Hi {{first_name}},",
            "{You're on the list|We've got you down} for [event] — just need a {quick confirmation|thumbs up} to lock in your spot.",
            "{Let me know if plans changed|Happy to move you if the timing's off}.",
            "{{sender_name}}",
        ],
    },
    {
        'name': 'Replay Available If You Missed It',
        'category': 'event',
        'subject': 'Missed it? Replay is up',
        'preview_text': 'A recording available for catching up.',
        'html': [
            "Hi {{first_name}},",
            "{In case you missed it|If you couldn't make it}, the replay for [event] is now up — {about 30 minutes|short watch}.",
            "{Happy to send the link|Want me to send it over}?",
            "{{sender_name}}",
        ],
    },
    {
        'name': 'Bringing a Colleague?',
        'category': 'event',
        'subject': 'Bring a colleague along?',
        'preview_text': 'An invite to extend to your team.',
        'html': [
            "Hi {{first_name}},",
            "{Feel free to bring|Happy to have you bring} a colleague to [event] if this feels relevant to more of {{company}}'s team.",
            "{Just let me know who to add|Send names whenever}.",
            "{{sender_name}}",
        ],
    },

    # ── Pricing (+5) ─────────────────────────────────────────────────
    {
        'name': 'What This Would Cost {{company}}',
        'category': 'pricing',
        'subject': 'A quick number for {{company}}',
        'preview_text': 'A transparent estimate, no surprises.',
        'html': [
            "Hi {{first_name}},",
            "{Happy to put together|Can send over} a quick estimate for what this would look like for {{company}} — {no surprises|straightforward, no hidden fees}.",
            "{Want me to send it over|Should I put that together}?",
            "{{sender_name}}",
        ],
    },
    {
        'name': 'Simple Pricing, No Surprises',
        'category': 'pricing',
        'subject': 'Pricing, kept simple',
        'preview_text': 'A clear, upfront look at cost.',
        'html': [
            "Hi {{first_name}},",
            "{Wanted to be upfront|Figured I'd save you the back-and-forth} about pricing — {it's simpler than most tools in this space|there's no hidden tiering}.",
            "{Happy to walk through it|Want the breakdown}?",
            "{{sender_name}}",
        ],
    },
    {
        'name': 'ROI Breakdown for {{company}}',
        'category': 'pricing',
        'subject': 'A quick ROI breakdown',
        'preview_text': 'The math behind the investment.',
        'html': [
            "Hi {{first_name}},",
            "{Put together|Sketched out} a quick ROI breakdown for what this could look like at {{company}}'s scale — {should pay for itself in the first quarter|the math is pretty favorable}.",
            "{Want me to walk you through it|Happy to share the numbers}?",
            "{{sender_name}}",
        ],
    },
    {
        'name': 'Is Budget the Blocker?',
        'category': 'pricing',
        'subject': 'Is budget the blocker, {{first_name}}?',
        'preview_text': 'Checking if cost is what stalled things.',
        'html': [
            "Hi {{first_name}},",
            "{Curious|Just wondering} — is budget what's holding this up, or is it more about timing for {{company}}?",
            "{There's usually a plan that fits|Happy to find something that works} either way.",
            "{{sender_name}}",
        ],
    },
    {
        'name': 'Custom Quote for {{company}}',
        'category': 'pricing',
        'subject': 'A custom quote, ready when you are',
        'preview_text': 'A tailored number based on your needs.',
        'html': [
            "Hi {{first_name}},",
            "{Put together|Drafted} a custom quote based on what we discussed for {{company}} — {happy to adjust|open to tweaking it} based on what matters most.",
            "{Want me to send it over|Should I share it now}?",
            "{{sender_name}}",
        ],
    },

    # ── Re-engagement (+6) ───────────────────────────────────────────
    {
        'name': 'Long Time, {{first_name}}',
        'category': 'reengagement',
        'subject': "It's been a while, {{first_name}}",
        'preview_text': 'Reconnecting after some time apart.',
        'html': [
            "Hi {{first_name}},",
            "{It's been a while|Long time no talk} — {things have changed quite a bit|a lot has shifted} at {{sender_company}} since we last spoke.",
            "{Worth reconnecting|Open to a quick catch-up}?",
            "{{sender_name}}",
        ],
    },
    {
        'name': 'What Changed Since We Last Talked',
        'category': 'reengagement',
        'subject': "What's changed since we last spoke",
        'preview_text': 'An update on what might make this timely now.',
        'html': [
            "Hi {{first_name}},",
            "{Since we last talked|A lot has happened since then} — {{sender_company}} has {added [feature]|improved [area]|grown quite a bit}.",
            "{Worth a second look|Open to revisiting this}?",
            "{{sender_name}}",
        ],
    },
    {
        'name': 'Second Chance?',
        'category': 'reengagement',
        'subject': 'A second chance to make this useful',
        'preview_text': 'Reopening the conversation with fresh context.',
        'html': [
            "Hi {{first_name}},",
            "{Not sure if the timing was just off before|Things may have changed on your end} — {wanted to check back in|figured it was worth another try}.",
            "{Still relevant for {{company}}|Anything changed on your side}?",
            "{{sender_name}}",
        ],
    },
    {
        'name': 'Picking This Back Up',
        'category': 'reengagement',
        'subject': 'Picking this back up, {{first_name}}',
        'preview_text': 'Resuming a conversation from before.',
        'html': [
            "Hi {{first_name}},",
            "{Wanted to pick this back up|Figured I'd revisit this} — {last we spoke|last time we connected} the timing wasn't quite right.",
            "{Has anything changed|Worth revisiting} for {{company}}?",
            "{{sender_name}}",
        ],
    },
    {
        'name': 'New Here? {{sender_company}} Has Changed',
        'category': 'reengagement',
        'subject': "{{sender_company}} looks different now",
        'preview_text': 'A lot has changed since your last look.',
        'html': [
            "Hi {{first_name}},",
            "If it's {been a while since you looked at us|been some time}, {{sender_company}} has changed quite a bit — {new features|a simpler workflow|better results for teams like {{company}}}.",
            "{Worth another look|Open to a quick refresher}?",
            "{{sender_name}}",
        ],
    },
    {
        'name': 'Worth Another Look?',
        'category': 'reengagement',
        'subject': 'Worth another look, {{first_name}}?',
        'preview_text': 'A short nudge to revisit an old conversation.',
        'html': [
            "Hi {{first_name}},",
            "{Not sure where this landed|Curious where things stand} on your end — {worth reopening|open to revisiting} the conversation?",
            "{No pressure either way|Totally fine if not}.",
            "{{sender_name}}",
        ],
    },

    # ── Product Update (+6) ──────────────────────────────────────────
    {
        'name': 'Big Changes at {{sender_company}}',
        'category': 'product_update',
        'subject': 'Big changes at {{sender_company}}',
        'preview_text': 'Notable updates worth knowing about.',
        'html': [
            "Hi {{first_name}},",
            "{Wanted to flag|Quick heads-up} — {{sender_company}} just {rolled out|shipped|launched} [feature], and it's built for exactly what {{company}} deals with.",
            "{Happy to show you around|Want a quick look}?",
            "{{sender_name}}",
        ],
    },
    {
        'name': 'You Asked, We Built It',
        'category': 'product_update',
        'subject': 'You asked — we built it',
        'preview_text': 'A feature shipped based on customer feedback.',
        'html': [
            "Hi {{first_name}},",
            "{A few customers asked for this|This came up a lot in feedback}, so we {built|shipped} [feature] — {thought of {{company}} right away|figured this might matter to you}.",
            "{Want a quick walkthrough|Curious to try it}?",
            "{{sender_name}}",
        ],
    },
    {
        'name': 'New: [Feature Name]',
        'category': 'product_update',
        'subject': 'New: [Feature Name]',
        'preview_text': 'A fresh capability just went live.',
        'html': [
            "Hi {{first_name}},",
            "{Just shipped|Excited to share} [Feature Name] — {solves|addresses} exactly the kind of [problem] teams like {{company}} run into.",
            "{Happy to show you how it works|Want a quick demo}?",
            "{{sender_name}}",
        ],
    },
    {
        'name': "This Month's Release Notes",
        'category': 'product_update',
        'subject': "This month's updates at {{sender_company}}",
        'preview_text': 'A roundup of recent improvements.',
        'html': [
            "Hi {{first_name}},",
            "{Quick roundup|Short recap} of what shipped this month at {{sender_company}} — {a few of these seemed relevant to {{company}}|thought a couple might catch your eye}.",
            "{Happy to point out the most relevant ones|Want the highlights}?",
            "{{sender_name}}",
        ],
    },
    {
        'name': 'A Feature Built for Teams Like {{company}}',
        'category': 'product_update',
        'subject': "Built with teams like {{company}} in mind",
        'preview_text': 'A feature designed around your exact use case.',
        'html': [
            "Hi {{first_name}},",
            "We {built|designed} this specifically with teams like {{company}} in mind — {handles [problem] without the usual workarounds|removes the extra steps most tools require}.",
            "{Worth a look|Want to see it in action}?",
            "{{sender_name}}",
        ],
    },
    {
        'name': 'Faster, Better, Simpler',
        'category': 'product_update',
        'subject': 'Faster, better, simpler',
        'preview_text': 'A meaningful improvement to how things work.',
        'html': [
            "Hi {{first_name}},",
            "{Just made things a lot faster|Simplified a big part of the product} — {should save {{company}} real time|cuts a step most teams complain about}.",
            "{Happy to show you what changed|Curious to hear your take}?",
            "{{sender_name}}",
        ],
    },

    # ── Thank You (+5) ───────────────────────────────────────────────
    {
        'name': 'Thanks for Your Time',
        'category': 'thank_you',
        'subject': 'Thanks for your time, {{first_name}}',
        'preview_text': 'Appreciating the conversation.',
        'html': [
            "Hi {{first_name}},",
            "{Really appreciate|Just wanted to say thanks for} the time today — {enjoyed learning more about|great to hear more about} {{company}}'s approach to [X].",
            "{Here's a quick recap|As promised, a short summary} of what we covered.",
            "{{sender_name}}",
        ],
    },
    {
        'name': 'Appreciate the Reply',
        'category': 'thank_you',
        'subject': 'Appreciate the reply, {{first_name}}',
        'preview_text': 'Thanking you for taking the time to respond.',
        'html': [
            "Hi {{first_name}},",
            "{Thanks for getting back to me|Appreciate the quick reply} — {good to know where things stand|helps a lot to have that context}.",
            "{Happy to follow up whenever makes sense|I'll check back at a better time}.",
            "{{sender_name}}",
        ],
    },
    {
        'name': 'Grateful for the Introduction',
        'category': 'thank_you',
        'subject': 'Thanks for the intro, {{first_name}}',
        'preview_text': 'Gratitude for a helpful connection.',
        'html': [
            "Hi {{first_name}},",
            "{Really appreciate|Thank you for} the introduction — {means a lot|was really helpful}.",
            "{Will keep you posted on how it goes|Happy to loop back with an update}.",
            "{{sender_name}}",
        ],
    },
    {
        'name': 'Thank You + Next Steps',
        'category': 'thank_you',
        'subject': 'Thank you — and next steps',
        'preview_text': 'Recapping the conversation and the plan.',
        'html': [
            "Hi {{first_name}},",
            "{Thanks again|Really appreciated} for the conversation today. {Here's what I understood|Quick recap of what we agreed on} as next steps.",
            "{Let me know if anything needs adjusting|Flag anything that's off}.",
            "{{sender_name}}",
        ],
    },
    {
        'name': 'Really Enjoyed That Conversation',
        'category': 'thank_you',
        'subject': 'That was a great conversation',
        'preview_text': 'A genuine thank-you after a good discussion.',
        'html': [
            "Hi {{first_name}},",
            "{Really enjoyed|Genuinely appreciated} that conversation — {especially the part about [topic]|your point about [topic] stuck with me}.",
            "{Looking forward to the next steps|Happy to keep this moving}.",
            "{{sender_name}}",
        ],
    },

    # ── News-jack (+4) ───────────────────────────────────────────────
    {
        'name': 'Saw the Announcement',
        'category': 'news_jack',
        'subject': 'Saw the announcement, {{first_name}}',
        'preview_text': 'Reacting to recent company news.',
        'html': [
            "Hi {{first_name}},",
            "{Saw the announcement|Caught the news} about {{company}} — {exciting stuff|congrats on that}.",
            "{Teams at that stage often run into [problem]|Growth like that usually surfaces [problem]} — happy to share how we've helped others navigate it.",
            "{{sender_name}}",
        ],
    },
    {
        'name': 'Congrats on the Raise',
        'category': 'news_jack',
        'subject': 'Congrats on the raise, {{first_name}}',
        'preview_text': 'Recognizing a funding milestone.',
        'html': [
            "Hi {{first_name}},",
            "{Congrats on the round|Saw the funding news} — {big milestone|exciting times ahead} for {{company}}.",
            "As you scale, {a lot of teams run into|this is usually when [problem] shows up}. Happy to chat if useful.",
            "{{sender_name}}",
        ],
    },
    {
        'name': 'Big News for {{company}}',
        'category': 'news_jack',
        'subject': 'Big news for {{company}}',
        'preview_text': 'A timely note tied to recent developments.',
        'html': [
            "Hi {{first_name}},",
            "{Saw the news|Just read about} {{company}}'s recent {launch|expansion|announcement} — {well done|congrats}.",
            "{Wanted to reach out while it's top of mind|Figured the timing made sense to connect}.",
            "{{sender_name}}",
        ],
    },
    {
        'name': 'Reading About {{company}} Today',
        'category': 'news_jack',
        'subject': 'Reading about {{company}} today',
        'preview_text': 'Reaching out after recent press coverage.',
        'html': [
            "Hi {{first_name}},",
            "{Came across|Was reading} some coverage on {{company}} today — {impressive momentum|great to see the growth}.",
            "{Thought it was a good time to reach out|Figured now was as good a time as any}.",
            "{{sender_name}}",
        ],
    },

    # ── Other (+7) ───────────────────────────────────────────────────
    {
        'name': 'Just Checking In',
        'category': 'other',
        'subject': 'Just checking in, {{first_name}}',
        'preview_text': 'A low-key, no-agenda check-in.',
        'html': [
            "Hi {{first_name}},",
            "{No agenda here|Nothing urgent} — just checking in to see how things are going at {{company}}.",
            "{Happy to catch up whenever|Let me know if now's a good time}.",
            "{{sender_name}}",
        ],
    },
    {
        'name': 'Quick Thought',
        'category': 'other',
        'subject': 'A quick thought, {{first_name}}',
        'preview_text': 'A small idea worth sharing.',
        'html': [
            "Hi {{first_name}},",
            "{Had a quick thought|Something crossed my mind} that might be relevant to {{company}} — {wanted to share it while it was fresh|figured it was worth mentioning}.",
            "{Let me know what you think|Curious for your take}.",
            "{{sender_name}}",
        ],
    },
    {
        'name': 'Something Came to Mind',
        'category': 'other',
        'subject': 'Something came to mind, {{first_name}}',
        'preview_text': 'A relevant idea sparked by something recent.',
        'html': [
            "Hi {{first_name}},",
            "{Something came to mind|This crossed my mind} after {a conversation earlier|reading something recently} — {thought of {{company}}|figured it might apply here}.",
            "{Worth a quick chat|Happy to explain more} if it's relevant.",
            "{{sender_name}}",
        ],
    },
    {
        'name': 'A Different Angle',
        'category': 'other',
        'subject': 'A different angle on this, {{first_name}}',
        'preview_text': 'Approaching the topic from a new direction.',
        'html': [
            "Hi {{first_name}},",
            "{Wanted to try a different angle|Thinking about this differently} than my last note — {maybe [X] is the bigger priority for {{company}} right now|perhaps this matters more}.",
            "{Does that land better|Is that closer to the mark}?",
            "{{sender_name}}",
        ],
    },
    {
        'name': 'Loose Ends',
        'category': 'other',
        'subject': 'Tying up a loose end, {{first_name}}',
        'preview_text': 'Following up on something left open.',
        'html': [
            "Hi {{first_name}},",
            "{Wanted to tie up a loose end|Circling back on something left open} from our last exchange.",
            "{Let me know if it's still relevant|Happy to pick this back up} whenever works.",
            "{{sender_name}}",
        ],
    },
    {
        'name': 'One Thing I Forgot to Mention',
        'category': 'other',
        'subject': 'One thing I forgot to mention',
        'preview_text': 'A small but useful detail left out before.',
        'html': [
            "Hi {{first_name}},",
            "{Forgot to mention this last time|One thing I left out before} — {might be useful for {{company}}|thought it was worth adding}.",
            "{Happy to expand if useful|Let me know if you want more detail}.",
            "{{sender_name}}",
        ],
    },
    {
        'name': 'Housekeeping',
        'category': 'other',
        'subject': 'Quick housekeeping, {{first_name}}',
        'preview_text': 'A small administrative note.',
        'html': [
            "Hi {{first_name}},",
            "{Just a quick housekeeping note|Small administrative thing} — {wanted to confirm your details are still current|checking your info is still up to date}.",
            "{Let me know if anything's changed|Flag anything that needs updating}.",
            "{{sender_name}}",
        ],
    },
]


def apply(apps, schema_editor):
    EmailTemplate = apps.get_model('email_templates', 'EmailTemplate')
    for t in TEMPLATES:
        html = ''.join(f'<p>{line}</p>' for line in t['html'])
        text = '\n\n'.join(line.replace('<br>', '\n') for line in t['html'])
        EmailTemplate.objects.update_or_create(
            user=None, name=t['name'],
            defaults={
                'category': t['category'],
                'subject': t['subject'],
                'preview_text': t['preview_text'],
                'html_content': html,
                'text_content': text,
                'variables': MERGE_TAGS,
                'is_active': True,
                'is_system': True,
            },
        )


def revert(apps, schema_editor):
    EmailTemplate = apps.get_model('email_templates', 'EmailTemplate')
    EmailTemplate.objects.filter(user=None, is_system=True, name__in=[t['name'] for t in TEMPLATES]).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('email_templates', '0005_add_more_templates_and_categories'),
    ]

    operations = [
        migrations.RunPython(apply, revert),
    ]
