from django.db.models.signals import post_delete
from django.dispatch import receiver

from .models import LearningMaterial, Question, QuizAnswerAttachment


@receiver(post_delete, sender=LearningMaterial)
def delete_learning_material_file(sender, instance, **kwargs):
    if instance.file:
        instance.file.delete(save=False)


@receiver(post_delete, sender=Question)
def delete_question_file(sender, instance, **kwargs):
    if instance.question_file:
        instance.question_file.delete(save=False)


@receiver(post_delete, sender=QuizAnswerAttachment)
def delete_quiz_answer_attachment_file(sender, instance, **kwargs):
    if instance.file:
        instance.file.delete(save=False)
