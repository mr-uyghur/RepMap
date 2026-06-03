from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('representatives', '0009_expand_level_choices'),
    ]

    operations = [
        migrations.AlterField(
            model_name='representative',
            name='photo_url',
            field=models.URLField(blank=True, max_length=500),
        ),
        migrations.AlterField(
            model_name='representative',
            name='website',
            field=models.URLField(blank=True, max_length=500),
        ),
    ]
