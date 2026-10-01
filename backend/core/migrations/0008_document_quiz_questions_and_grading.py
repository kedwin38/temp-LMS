from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ('core', '0007_quizattempt_answers'),
    ]

    operations = [
        migrations.AddField(
            model_name='question',
            name='question_file',
            field=models.FileField(blank=True, null=True, upload_to='quiz/questions/'),
        ),
        migrations.AddField(
            model_name='question',
            name='question_type',
            field=models.CharField(choices=[('MULTIPLE_CHOICE', 'Multiple choice'), ('DOCUMENT', 'Document response')], default='MULTIPLE_CHOICE', max_length=20),
        ),
        migrations.AlterField(
            model_name='question',
            name='prompt',
            field=models.TextField(blank=True, default=''),
        ),
        migrations.AlterField(
            model_name='quizattempt',
            name='percentage',
            field=models.FloatField(blank=True, null=True),
        ),
        migrations.AlterField(
            model_name='quizattempt',
            name='score',
            field=models.PositiveIntegerField(blank=True, null=True),
        ),
        migrations.CreateModel(
            name='QuizAnswerAttachment',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('file', models.FileField(upload_to='quiz/answers/')),
                ('uploaded_at', models.DateTimeField(auto_now_add=True)),
                ('attempt', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='answer_attachments', to='core.quizattempt')),
                ('question', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='answer_attachments', to='core.question')),
            ],
        ),
    ]