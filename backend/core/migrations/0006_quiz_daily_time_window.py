from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0005_quiz_results_visible_to_students'),
    ]

    operations = [
        migrations.AddField(
            model_name='quiz',
            name='opens_at',
            field=models.TimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='quiz',
            name='closes_at',
            field=models.TimeField(blank=True, null=True),
        ),
    ]