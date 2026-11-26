from app import count_words


def test_count_words():
    assert count_words("two words") == 2
