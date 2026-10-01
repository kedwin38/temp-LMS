from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0004_remove_chapter_academic_level_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='quiz',
            name='results_visible_to_students',
            field=models.BooleanField(default=False),
        ),
    ]