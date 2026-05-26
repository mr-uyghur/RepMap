import logging
from celery import shared_task
from django.contrib.auth.models import User

from .services.congress_api import fetch_recent_votes

logger = logging.getLogger(__name__)


@shared_task(name='representatives.check_watchlist_activity')
def check_watchlist_activity():
    """Check for new votes on watched representatives and create notifications."""
    from .models import UserWatchlist, Notification, Representative

    users_with_watchlist = User.objects.filter(
        watchlist_entries__isnull=False
    ).distinct().prefetch_related('watchlist_entries__representative')

    notifications_created = 0

    for user in users_with_watchlist:
        for entry in user.watchlist_entries.select_related('representative').all():
            rep = entry.representative
            bioguide_id = (rep.external_ids or {}).get('bioguide_id')
            if not bioguide_id:
                continue

            govtrack_id = (rep.external_ids or {}).get('govtrack_id')
            votes = fetch_recent_votes(bioguide_id, govtrack_id=govtrack_id)

            if not votes:
                continue

            latest_vote = votes[0]
            vote_key = f"{bioguide_id}:{latest_vote.get('vote_date', '')}"

            already_notified = Notification.objects.filter(
                user=user,
                representative=rep,
                notification_type='new_vote',
                metadata__vote_key=vote_key,
            ).exists()

            if already_notified:
                continue

            title = latest_vote.get('bill_title') or 'Floor Vote'
            position = latest_vote.get('vote_position', '')
            body = f'{rep.name} voted {position} on: {title}'

            Notification.objects.create(
                user=user,
                representative=rep,
                notification_type='new_vote',
                title=f'{rep.name} cast a vote',
                body=body,
                metadata={
                    'vote_key': vote_key,
                    'vote_position': position,
                    'vote_date': latest_vote.get('vote_date', ''),
                },
            )
            notifications_created += 1

    logger.info('check_watchlist_activity: created %d notifications', notifications_created)
    return notifications_created
