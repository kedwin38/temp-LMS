from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('core', '0006_quiz_daily_time_window'),
    ]

    operations = [
        migrations.AddField(
            model_name='quizattempt',
            name='answers',
            field=models.JSONField(default=dict),
        ),
    ]