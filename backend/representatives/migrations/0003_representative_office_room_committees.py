from django.db import migrations, models
import representatives.models


class Migration(migrations.Migration):

    dependencies = [
        ('representatives', '0002_syncstatus'),
    ]

    operations = [
        migrations.AddField(
            model_name='representative',
            name='office_room',
            field=models.CharField(blank=True, default='', max_length=200),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name='representative',
            name='committee_assignments',
            field=representatives.models.JSONListField(default=list),
        ),
    ]
