from django.db import migrations

# Category for each of the 22 templates seeded in migration 0003.
EXISTING_CATEGORIES = {
    'Cold Intro': 'cold_intro',
    'Short & Direct Opener': 'cold_intro',
    'Question-Based Opener': 'cold_intro',
    'Problem-Agitate-Solve': 'cold_intro',
    'Value-First / Free Resource': 'cold_intro',
    'Case Study / Social Proof': 'case_study',
    'Testimonial-Led': 'case_study',
    'Mutual-Connection Intro': 'cold_intro',
    'Meeting Request': 'meeting',
    'Follow-up 1 (Bump)': 'follow_up',
    'Follow-up 2': 'follow_up',
    'Follow-up 3 (Final Check-in)': 'follow_up',
    'Break-up / Last Chance': 'breakup',
    'Re-engagement (Dormant Lead)': 'reengagement',
    'Event / Webinar Invite': 'event',
    'Referral Ask': 'referral',
    'Pricing / Demo Offer': 'pricing',
    'Quick-Win ROI Pitch': 'cold_intro',
    'News-jack (Funding/News)': 'news_jack',
    'Product Update Announcement': 'product_update',
    'Thank-You / Post-Meeting Follow-up': 'thank_you',
    'Video/Loom Intro': 'cold_intro',
}

# 10 additional templates to comfortably clear 30+ total.
NEW_TEMPLATES = [
    {
        'name': 'Post-Demo Follow-up',
        'category': 'meeting',
        'subject': 'Following up on our demo, {{first_name}}',
        'preview_text': 'Wanted to follow up after showing you around.',
        'html': [
            "Hi {{first_name}},",
            "Thanks again for taking the time for the demo. Wanted to check in — what stood out most for {{company}}?",
            "Happy to answer any follow-up questions or loop in the rest of your team.",
            "{{sender_name}}",
        ],
    },
    {
        'name': 'Second Meeting Nudge',
        'category': 'meeting',
        'subject': 'Still good for our chat, {{first_name}}?',
        'preview_text': 'Quick check that our time still works.',
        'html': [
            "Hi {{first_name}},",
            "Just confirming our call is still on — let me know if anything's changed on your end.",
            "Looking forward to it.",
            "{{sender_name}}",
        ],
    },
    {
        'name': 'Objection: Not The Right Time',
        'category': 'follow_up',
        'subject': 'No worries, {{first_name}} — mind if I check back?',
        'preview_text': "Totally understand — happy to circle back later.",
        'html': [
            "Hi {{first_name}},",
            "Totally understand if now isn't the right time for {{company}}. Mind if I check back in a quarter or so?",
            "In the meantime, feel free to reach out if anything changes.",
            "{{sender_name}}",
        ],
    },
    {
        'name': 'Objection: Using a Competitor',
        'category': 'pricing',
        'subject': 'Curious how things are going with your current tool',
        'preview_text': 'Happy to show you the difference, no pressure.',
        'html': [
            "Hi {{first_name}},",
            "Saw that {{company}} is likely already using something for this — curious how it's working out.",
            "A lot of teams switch to {{sender_company}} for [specific advantage]. Happy to show you the difference if you're ever evaluating options.",
            "{{sender_name}}",
        ],
    },
    {
        'name': 'Free Trial Offer',
        'category': 'pricing',
        'subject': 'Want to try {{sender_company}} free for 14 days?',
        'preview_text': 'No card required — see if it fits your workflow.',
        'html': [
            "Hi {{first_name}},",
            "Want to try {{sender_company}} free for 14 days? No card required — just enough time to see if it fits {{company}}'s workflow.",
            "Happy to set it up whenever works for you.",
            "{{sender_name}}",
        ],
    },
    {
        'name': 'Customer Milestone',
        'category': 'case_study',
        'subject': 'Congrats on the milestone, {{first_name}}',
        'preview_text': 'Saw the news and thought of a similar story.',
        'html': [
            "Hi {{first_name}},",
            "Congrats on the milestone at {{company}} — well earned.",
            "It reminded me of a similar customer of ours who hit a comparable stage and used {{sender_company}} to keep scaling without adding headcount. Happy to share how, if useful.",
            "{{sender_name}}",
        ],
    },
    {
        'name': 'Job Change / New Role Congrats',
        'category': 'news_jack',
        'subject': 'Congrats on the new role at {{company}}',
        'preview_text': 'Saw you recently moved to a new position.',
        'html': [
            "Hi {{first_name}},",
            "Congrats on the new role at {{company}}! Always exciting to see a fresh start.",
            "If you're re-evaluating tools as you settle in, I'd love to show you how {{sender_company}} could help — no pressure either way.",
            "{{sender_name}}",
        ],
    },
    {
        'name': 'LinkedIn Connection Follow-up',
        'category': 'cold_intro',
        'subject': 'Great connecting, {{first_name}}',
        'preview_text': 'Following up on our LinkedIn connection.',
        'html': [
            "Hi {{first_name}},",
            "Great connecting on LinkedIn! Wanted to follow up properly here — we help teams like {{company}} with [X].",
            "Open to a quick chat sometime?",
            "{{sender_name}}",
        ],
    },
    {
        'name': 'Feedback / Survey Request',
        'category': 'thank_you',
        'subject': 'Quick favor — 60 seconds of feedback?',
        'preview_text': 'Your input would really help us improve.',
        'html': [
            "Hi {{first_name}},",
            "Would you mind sharing quick feedback on your experience so far? It genuinely helps us improve {{sender_company}} for teams like {{company}}.",
            "Just a couple of questions — shouldn't take more than a minute.",
            "{{sender_name}}",
        ],
    },
    {
        'name': 'Partnership Proposal',
        'category': 'referral',
        'subject': 'Potential partnership between us and {{company}}?',
        'preview_text': 'Think there could be a good fit here.',
        'html': [
            "Hi {{first_name}},",
            "I think there could be a good partnership opportunity between {{sender_company}} and {{company}} — our audiences overlap nicely.",
            "Open to exploring what that could look like?",
            "{{sender_name}}",
        ],
    },
]

MERGE_TAGS = ['first_name', 'last_name', 'company', 'title', 'sender_name', 'sender_company']


def apply(apps, schema_editor):
    EmailTemplate = apps.get_model('email_templates', 'EmailTemplate')

    for name, category in EXISTING_CATEGORIES.items():
        EmailTemplate.objects.filter(user=None, is_system=True, name=name).update(category=category)

    for t in NEW_TEMPLATES:
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
    EmailTemplate.objects.filter(user=None, is_system=True, name__in=[t['name'] for t in NEW_TEMPLATES]).delete()
    EmailTemplate.objects.filter(user=None, is_system=True, name__in=list(EXISTING_CATEGORIES)).update(category='other')


class Migration(migrations.Migration):

    dependencies = [
        ('email_templates', '0004_emailtemplate_category'),
    ]

    operations = [
        migrations.RunPython(apply, revert),
    ]
