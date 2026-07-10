from django.db import migrations

# 22 built-in, generic cold-outreach templates — shared read-only with every
# user (user=None, is_system=True). Merge tags match the ones already
# supported by campaign-form.tsx's SUBJECT_CONTACT_TAGS/SUBJECT_SENDER_TAGS
# and apps.campaigns.services.render_template_for_contact.
TEMPLATES = [
    {
        'name': 'Cold Intro',
        'subject': 'Quick question about {{company}}',
        'preview_text': "Noticed {{company}}'s been growing — thought I'd reach out.",
        'html': [
            "Hi {{first_name}},",
            "I noticed {{company}} has been growing fast lately — congrats on that.",
            "I'm {{sender_name}} from {{sender_company}}. We help teams like yours solve [problem] without [common pain point].",
            "Worth a quick chat to see if it's a fit?",
            "Best,<br>{{sender_name}}",
        ],
    },
    {
        'name': 'Short & Direct Opener',
        'subject': '{{first_name}} — 15 seconds?',
        'preview_text': 'Mind if I send a 2-line pitch?',
        'html': [
            "Hi {{first_name}},",
            "Do you handle [X] at {{company}}? If so, mind if I send over a 2-line pitch?",
            "{{sender_name}}",
        ],
    },
    {
        'name': 'Question-Based Opener',
        'subject': 'How is {{company}} handling [X] today?',
        'preview_text': 'Curious how your team handles this today.',
        'html': [
            "Hi {{first_name}},",
            "Curious — how does {{company}} currently handle [X]? Most teams we talk to are stuck between [option A] and [option B].",
            "We built something that removes that tradeoff entirely. Want a 2-minute overview?",
            "{{sender_name}}",
        ],
    },
    {
        'name': 'Problem-Agitate-Solve',
        'subject': 'The hidden cost of [problem] at {{company}}',
        'preview_text': "Most teams don't realize how much this costs until it's too late.",
        'html': [
            "Hi {{first_name}},",
            "Most teams don't realize how much time [problem] actually costs until it's too late — lost deals, frustrated reps, missed targets.",
            "We built {{sender_company}} specifically to fix this. Teams like yours typically see [result] within the first month.",
            "Open to a quick look?",
            "{{sender_name}}",
        ],
    },
    {
        'name': 'Value-First / Free Resource',
        'subject': 'A quick resource for {{company}}',
        'preview_text': 'No pitch here — just thought this might help.',
        'html': [
            "Hi {{first_name}},",
            "No pitch here — just thought this might help. We put together a short guide on [topic] that a lot of teams in your position have found useful.",
            "Happy to send it over if you'd like. Also open to a quick chat if you want to go deeper.",
            "{{sender_name}}",
        ],
    },
    {
        'name': 'Case Study / Social Proof',
        'subject': 'How a similar company solved [problem]',
        'preview_text': 'Wanted to share a quick result from a similar team.',
        'html': [
            "Hi {{first_name}},",
            "Wanted to share how a company similar to {{company}} tackled [problem] — they saw [specific result] within [timeframe] after switching to {{sender_company}}.",
            "Happy to walk you through exactly how, if useful.",
            "{{sender_name}}",
        ],
    },
    {
        'name': 'Testimonial-Led',
        'subject': '"{{sender_company}} paid for itself in a month"',
        'preview_text': 'One of our customers told us this recently.',
        'html': [
            "Hi {{first_name}},",
            'One of our customers told us: "{{sender_company}} paid for itself within the first month — we didn\'t expect that."',
            "Given what {{company}} is working on, I think you'd see something similar. Want me to share how?",
            "{{sender_name}}",
        ],
    },
    {
        'name': 'Mutual-Connection Intro',
        'subject': '{{first_name}}, thought you\'d want to see this',
        'preview_text': 'Your name kept coming up this week.',
        'html': [
            "Hi {{first_name}},",
            "I've been speaking with a few other {{title}}s in your space this week and your name kept coming up as someone doing great work at {{company}}.",
            "Wanted to reach out directly — we help teams with [X]. Worth a quick intro call?",
            "{{sender_name}}",
        ],
    },
    {
        'name': 'Meeting Request',
        'subject': '15 minutes this week?',
        'preview_text': "Would love to learn more about {{company}}'s approach.",
        'html': [
            "Hi {{first_name}},",
            "Would you be open to a quick 15-minute call this week? I'd love to learn more about how {{company}} approaches [X], and share how we've helped similar teams.",
            "Here's my calendar — happy to work around your schedule.",
            "{{sender_name}}",
        ],
    },
    {
        'name': 'Follow-up 1 (Bump)',
        'subject': 'Re: Quick question about {{company}}',
        'preview_text': 'Just floating this back to the top of your inbox.',
        'html': [
            "Hi {{first_name}},",
            "Just floating this back to the top of your inbox in case it got buried. Still happy to share more if it's useful.",
            "{{sender_name}}",
        ],
    },
    {
        'name': 'Follow-up 2',
        'subject': 'Re: Quick question about {{company}}',
        'preview_text': "Totally understand if the timing isn't right.",
        'html': [
            "Hi {{first_name}},",
            "Following up once more — totally understand if the timing isn't right. If it's helpful, I can send a short 2-minute overview instead of asking for a call.",
            "{{sender_name}}",
        ],
    },
    {
        'name': 'Follow-up 3 (Final Check-in)',
        'subject': 'One last check-in',
        'preview_text': "This'll be my last note on this.",
        'html': [
            "Hi {{first_name}},",
            "Don't want to keep cluttering your inbox — this'll be my last note on this. If solving [problem] becomes a priority down the line, feel free to reach out anytime.",
            "Wishing you and the team at {{company}} all the best.",
            "{{sender_name}}",
        ],
    },
    {
        'name': 'Break-up / Last Chance',
        'subject': 'Should I close your file?',
        'preview_text': "I'll assume the timing isn't right and stop following up.",
        'html': [
            "Hi {{first_name}},",
            "I've reached out a few times about [X] without a response, so I'll assume the timing isn't right and stop following up here.",
            "If that changes, my inbox is always open.",
            "{{sender_name}}",
        ],
    },
    {
        'name': 'Re-engagement (Dormant Lead)',
        'subject': 'Still thinking about [X], {{first_name}}?',
        'preview_text': "It's been a while since we last connected.",
        'html': [
            "Hi {{first_name}},",
            "It's been a while since we last connected. A lot has changed at {{sender_company}} since then — [new feature/result].",
            "Worth reconnecting to see if it's a better fit now?",
            "{{sender_name}}",
        ],
    },
    {
        'name': 'Event / Webinar Invite',
        'subject': "You're invited: [Event Name]",
        'preview_text': 'Hosting a session I think would be relevant for you.',
        'html': [
            "Hi {{first_name}},",
            "We're hosting a session on [topic] that I think would be relevant for your role at {{company}}.",
            "[Date/time] — would love to have you there. Want me to send the link?",
            "{{sender_name}}",
        ],
    },
    {
        'name': 'Referral Ask',
        'subject': 'Quick favor, {{first_name}}?',
        'preview_text': "Not sure if this is relevant to you directly.",
        'html': [
            "Hi {{first_name}},",
            "Not sure if this is relevant to you directly, but if you know someone at {{company}} who owns [X], I'd really appreciate an intro.",
            "Either way, thanks for reading — hope things are going well.",
            "{{sender_name}}",
        ],
    },
    {
        'name': 'Pricing / Demo Offer',
        'subject': 'Ready to see {{sender_company}} in action?',
        'preview_text': 'Happy to set up a quick tailored demo.',
        'html': [
            "Hi {{first_name}},",
            "Happy to set up a quick demo tailored to {{company}}'s use case — no obligation, just to see if it's a fit and go over pricing.",
            "Does later this week work?",
            "{{sender_name}}",
        ],
    },
    {
        'name': 'Quick-Win ROI Pitch',
        'subject': 'A quick win for {{company}}',
        'preview_text': 'Most teams see results within 30 days.',
        'html': [
            "Hi {{first_name}},",
            "Most teams we work with see [specific metric improvement] within the first 30 days — without changing their existing workflow.",
            "Want me to show you exactly how that would apply to {{company}}?",
            "{{sender_name}}",
        ],
    },
    {
        'name': 'News-jack (Funding/News)',
        'subject': 'Congrats on the news, {{first_name}}',
        'preview_text': 'Saw the recent news about {{company}} — congrats!',
        'html': [
            "Hi {{first_name}},",
            "Saw the recent news about {{company}} — congrats! Exciting times ahead.",
            "As you scale, teams often run into [problem]. We've helped others navigate exactly that stage. Worth a quick conversation?",
            "{{sender_name}}",
        ],
    },
    {
        'name': 'Product Update Announcement',
        'subject': "We just shipped something you'll like",
        'preview_text': 'A heads-up about something built for teams like yours.',
        'html': [
            "Hi {{first_name}},",
            "Wanted to give you a heads-up — {{sender_company}} just launched [feature], built specifically for teams like {{company}} dealing with [problem].",
            "Happy to show you around if you're curious.",
            "{{sender_name}}",
        ],
    },
    {
        'name': 'Thank-You / Post-Meeting Follow-up',
        'subject': 'Great chatting today, {{first_name}}',
        'preview_text': 'Thanks for the time today — quick recap inside.',
        'html': [
            "Hi {{first_name}},",
            "Thanks for the time today — really enjoyed learning more about {{company}}'s approach to [X].",
            "As promised, here's a quick recap of what we discussed and the next steps. Let me know if anything needs adjusting.",
            "{{sender_name}}",
        ],
    },
    {
        'name': 'Video/Loom Intro',
        'subject': 'A quick video for {{first_name}}',
        'preview_text': 'Recorded a 90-second video instead of a wall of text.',
        'html': [
            "Hi {{first_name}},",
            "Instead of a wall of text, I recorded a quick 90-second video showing exactly how {{sender_company}} could help {{company}} with [X]. [Video link]",
            "Let me know your thoughts!",
            "{{sender_name}}",
        ],
    },
]

MERGE_TAGS = ['first_name', 'last_name', 'company', 'title', 'sender_name', 'sender_company']


def seed_templates(apps, schema_editor):
    EmailTemplate = apps.get_model('email_templates', 'EmailTemplate')
    for t in TEMPLATES:
        html = ''.join(f'<p>{line}</p>' for line in t['html'])
        text = '\n\n'.join(line.replace('<br>', '\n') for line in t['html'])
        EmailTemplate.objects.update_or_create(
            user=None, name=t['name'],
            defaults={
                'subject': t['subject'],
                'preview_text': t['preview_text'],
                'html_content': html,
                'text_content': text,
                'variables': MERGE_TAGS,
                'is_active': True,
                'is_system': True,
            },
        )


def remove_templates(apps, schema_editor):
    EmailTemplate = apps.get_model('email_templates', 'EmailTemplate')
    EmailTemplate.objects.filter(user=None, is_system=True, name__in=[t['name'] for t in TEMPLATES]).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('email_templates', '0002_emailtemplate_is_system_alter_emailtemplate_user'),
    ]

    operations = [
        migrations.RunPython(seed_templates, remove_templates),
    ]
